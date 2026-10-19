"""Reproducible local retrieval, citation, and faithfulness evaluation."""

import asyncio
import hashlib
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

from opennotebook_core.llm import GroundedFakeLLMProvider, LLMProvider
from opennotebook_core.models import Base, Chunk, Notebook, Source
from opennotebook_core.prompts.chat_v1 import build_chat_messages, validate_citations
from opennotebook_core.retrieval import ContextSelection, fts_search, rrf_merge, vector_search
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parent
MARKER_RE = re.compile(r"\[S\d+\]")
CONTENT_WORDS = {
    "about", "after", "also", "among", "because", "been", "before", "being",
    "does", "during", "from", "have", "into", "near", "over", "that", "their",
    "them", "then", "there", "these", "they", "this", "through", "under", "very",
    "were", "what", "when", "where", "which", "while", "with", "would",
}


def claims_supported_by_citations(answer: str, evidence: list[str]) -> bool:
    """Conservative lexical support check: every answer sentence must map to its citations."""
    cited_words = {
        word for text in evidence for word in re.findall(r"[a-z0-9]+", text.casefold())
    }
    claims = [
        claim.strip()
        for claim in re.split(r"(?<=[.!?])\s+", MARKER_RE.sub("", answer))
        if claim.strip()
    ]
    if not claims or not evidence:
        return False
    for claim in claims:
        words = {
            word
            for word in re.findall(r"[a-z0-9]+", claim.casefold())
            if len(word) >= 4 and word not in CONTENT_WORDS
        }
        if words and len(words & cited_words) / len(words) < 0.75:
            return False
    return True


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
    faithful_answers: int
    relevant_answers: int

    @property
    def hit_rate_at_8(self) -> float:
        return self.hits / self.total

    @property
    def citation_validity(self) -> float:
        return self.valid_citations / self.total

    @property
    def faithfulness(self) -> float:
        return self.faithful_answers / self.total

    @property
    def answer_relevance(self) -> float:
        return self.relevant_answers / self.total


async def run_evals(
    *, rrf_k: int = 60, llm_provider: LLMProvider | None = None
) -> EvalMetrics:
    cases = json.loads((ROOT / "questions.json").read_text(encoding="utf-8"))
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    fake = EvalEmbedding()
    names = {
        "solar": "Helios solar pilot",
        "wetlands": "Mangrove restoration",
        "printing": "Community print archive",
        "batteries": "Grid storage field notes",
        "coral": "Coral nursery survey",
        "observatory": "Hilltop observatory log",
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

            hits = valid = faithful = relevant = 0
            for case in cases:
                question = case["question"]
                selected = list(names)
                vectors = await vector_search(db, fake, "eval-book", selected, question, 768)
                lexical = await fts_search(db, "eval-book", selected, question)
                ranked = rrf_merge(vectors, lexical, limit=8, k=rrf_k)
                expected_id = f"{case['source']}-{case['paragraph']}"
                hits += any(
                    chunk.id == expected_id and case["expected_fact"] in chunk.text
                    for chunk in ranked
                )

                selection = ContextSelection(ranked, names, "hybrid", question)
                prompt = build_chat_messages(
                    selection, question, [], persona=None, response_length="short"
                )
                llm = llm_provider or GroundedFakeLLMProvider()
                raw = "".join([part async for part in llm.stream(prompt)])
                answer, citations = validate_citations(raw, selection)
                lookup = {index: chunk for index, chunk in enumerate(ranked, start=1)}
                valid += bool(citations) and all(
                    citation["n"] in lookup
                    and citation["chunk_id"] == lookup[citation["n"]].id
                    and citation["source_id"] == lookup[citation["n"]].source_id
                    and f"[S{citation['n']}]" in answer
                    for citation in citations
                )
                # Every answer sentence must have >=75% content-word support in
                # the passages it cites. This is an offline proxy, not an LLM judge.
                cited_text = [
                    lookup[citation["n"]].text
                    for citation in citations
                    if citation["n"] in lookup
                ]
                faithful += claims_supported_by_citations(answer, cited_text)
                relevant += case["expected_fact"].casefold() in answer.casefold()
        return EvalMetrics(len(cases), hits, valid, faithful, relevant)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    metrics = asyncio.run(run_evals())
    print(f"hit-rate@8: {metrics.hits}/{metrics.total} = {metrics.hit_rate_at_8:.1%}")
    print(f"citation validity: {metrics.valid_citations}/{metrics.total}")
    print(f"citation validity percent: {metrics.citation_validity:.1%}")
    print(
        f"faithfulness: {metrics.faithful_answers}/{metrics.total} = "
        f"{metrics.faithfulness:.1%}"
    )
    print(
        f"answer relevance: {metrics.relevant_answers}/{metrics.total} = "
        f"{metrics.answer_relevance:.1%}"
    )
    if metrics.hit_rate_at_8 < 0.9 or metrics.citation_validity < 1 or metrics.faithfulness < 0.9:
        raise SystemExit(1)
