"""Reproducible local retrieval and citation evaluation over three short sources."""

import asyncio
import hashlib
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

from opennotebook_core.llm import GroundedFakeLLMProvider
from opennotebook_core.models import Base, Chunk, Notebook, Source
from opennotebook_core.prompts.chat_v1 import build_chat_messages, validate_citations
from opennotebook_core.retrieval import ContextSelection, fts_search, rrf_merge, vector_search
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parent


class EvalEmbedding:
    """Deterministic token vectors so offline tests exercise ranking, not network calls."""

    async def embed(self, texts: list[str], kind: str, dim: int) -> list[list[float]]:
        if kind not in {"query", "document"}:
            raise ValueError(kind)
        vectors = []
        for text in texts:
            vector = [0.0] * dim
            for token in set(re.findall(r"[a-z0-9-]+", text.lower())):
                if len(token) < 4 or token in {
                    "what",
                    "where",
                    "when",
                    "which",
                    "many",
                    "much",
                    "from",
                    "into",
                    "with",
                    "after",
                    "were",
                    "that",
                    "this",
                    "their",
                }:
                    continue
                slot = int.from_bytes(hashlib.sha256(token.encode()).digest()[:4], "big") % dim
                vector[slot] += 1
            norm = math.sqrt(sum(value * value for value in vector)) or 1
            vectors.append([value / norm for value in vector])
        return vectors


@dataclass(frozen=True)
class EvalMetrics:
    total: int
    hits: int
    valid_citations: int

    @property
    def hit_rate_at_8(self) -> float:
        return self.hits / self.total

    @property
    def citation_validity(self) -> float:
        return self.valid_citations / self.total


async def run_evals() -> EvalMetrics:
    cases = json.loads((ROOT / "questions.json").read_text(encoding="utf-8"))
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    fake = EvalEmbedding()
    names = {
        "solar": "Helios solar pilot",
        "wetlands": "Mangrove restoration",
        "printing": "Community print archive",
    }
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as db:
            db.add(
                Notebook(
                    id="eval-book", user_id="eval", title="Evaluation", response_length="short"
                )
            )
            await db.flush()
            for source_id, name in names.items():
                text = (ROOT / "docs" / f"{source_id}.md").read_text(encoding="utf-8")
                db.add(
                    Source(
                        id=source_id,
                        notebook_id="eval-book",
                        user_id="eval",
                        name=name,
                        kind="txt",
                        status="ready",
                        selected=True,
                        progress=100,
                        metadata_json={},
                    )
                )
                await db.flush()
                offset = 0
                ordinal = 0
                for paragraph in text.splitlines()[2:]:
                    if not paragraph.strip():
                        continue
                    start = text.index(paragraph, offset)
                    end = start + len(paragraph)
                    db.add(
                        Chunk(
                            id=f"{source_id}-{ordinal}",
                            source_id=source_id,
                            notebook_id="eval-book",
                            ordinal=ordinal,
                            text=paragraph,
                            char_start=start,
                            char_end=end,
                            heading_path=[],
                            embedding=(await fake.embed([paragraph], "document", 768))[0],
                            metadata_json={},
                        )
                    )
                    offset = end
                    ordinal += 1
            await db.commit()

            hits = valid = 0
            for case in cases:
                question = case["question"]
                selected = list(names)
                vectors = await vector_search(db, fake, "eval-book", selected, question, 768)
                lexical = await fts_search(db, "eval-book", selected, question)
                ranked = rrf_merge(vectors, lexical, limit=8)
                expected_id = f"{case['source']}-{case['paragraph']}"
                hits += any(
                    chunk.id == expected_id and case["expected_fact"] in chunk.text
                    for chunk in ranked
                )

                selection = ContextSelection(ranked, names, "hybrid", question)
                prompt = build_chat_messages(
                    selection, question, [], persona=None, response_length="short"
                )
                raw = "".join([part async for part in GroundedFakeLLMProvider().stream(prompt)])
                answer, citations = validate_citations(raw, selection)
                lookup = {index: chunk for index, chunk in enumerate(ranked, start=1)}
                valid += bool(citations) and all(
                    citation["n"] in lookup
                    and citation["chunk_id"] == lookup[citation["n"]].id
                    and citation["source_id"] == lookup[citation["n"]].source_id
                    and f"[S{citation['n']}]" in answer
                    for citation in citations
                )
        return EvalMetrics(len(cases), hits, valid)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    metrics = asyncio.run(run_evals())
    print(f"hit-rate@8: {metrics.hits}/{metrics.total} = {metrics.hit_rate_at_8:.1%}")
    print(f"citation validity: {metrics.valid_citations}/{metrics.total}")
    print(f"citation validity percent: {metrics.citation_validity:.1%}")
    if metrics.hit_rate_at_8 < 0.85 or metrics.citation_validity < 1:
        raise SystemExit(1)
