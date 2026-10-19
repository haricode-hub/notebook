"""Owned hybrid retrieval with a small full-context fast path."""

import math
import re
from dataclasses import dataclass
from typing import Protocol, TypeVar

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from opennotebook_core.embeddings import EmbeddingProvider
from opennotebook_core.llm import LLMProvider
from opennotebook_core.models import Chunk, MediaItem, Source

TOP_CANDIDATES = 30
RRF_K = 60
REFUSAL = "I couldn't find that in your sources."
Evidence = TypeVar("Evidence", Chunk, MediaItem)


def estimate_tokens(value: str) -> int:
    """Conservative, tokenizer-independent estimate for context budgeting."""
    return max(1, math.ceil(len(value) / 4))


@dataclass(frozen=True)
class ContextSelection:
    chunks: list[Chunk]
    source_names: dict[str, str]
    mode: str
    query: str
    media_items: list[MediaItem] | None = None


class Reranker(Protocol):
    async def rerank(self, query: str, chunks: list[Chunk]) -> list[Chunk]: ...


class NoopReranker:
    async def rerank(self, query: str, chunks: list[Chunk]) -> list[Chunk]:
        return chunks


def _tokens(value: str) -> set[str]:
    return {word for word in re.findall(r"[\w-]+", value.casefold()) if len(word) > 2}


async def _eligible_chunks(
    db: AsyncSession, notebook_id: str, selected_source_ids: list[str]
) -> list[Chunk]:
    if not selected_source_ids:
        return []
    result = await db.scalars(
        select(Chunk)
        .join(Source, Source.id == Chunk.source_id)
        .where(
            Chunk.notebook_id == notebook_id,
            Chunk.source_id.in_(selected_source_ids),
            Source.notebook_id == notebook_id,
            Source.selected.is_(True),
            Source.status == "ready",
        )
        .order_by(Chunk.source_id, Chunk.ordinal)
    )
    return list(result.all())


async def vector_search(
    db: AsyncSession,
    embedding: EmbeddingProvider,
    notebook_id: str,
    selected_source_ids: list[str],
    query: str,
    dim: int,
    limit: int = TOP_CANDIDATES,
) -> list[Chunk]:
    if not selected_source_ids:
        return []
    vector = (await embedding.embed([query], "query", dim))[0]
    if db.bind is not None and db.bind.dialect.name == "sqlite":
        candidates = await _eligible_chunks(db, notebook_id, selected_source_ids)

        def distance(chunk: Chunk) -> float:
            return 1 - sum(a * b for a, b in zip(chunk.embedding, vector, strict=True))

        return sorted(candidates, key=distance)[:limit]
    distance_expr = Chunk.embedding.cosine_distance(vector)
    result = await db.scalars(
        select(Chunk)
        .join(Source, Source.id == Chunk.source_id)
        .where(
            Chunk.notebook_id == notebook_id,
            Chunk.source_id.in_(selected_source_ids),
            Source.notebook_id == notebook_id,
            Source.selected.is_(True),
            Source.status == "ready",
        )
        .order_by(distance_expr)
        .limit(limit)
    )
    return list(result.all())


async def fts_search(
    db: AsyncSession,
    notebook_id: str,
    selected_source_ids: list[str],
    query: str,
    limit: int = TOP_CANDIDATES,
) -> list[Chunk]:
    if not selected_source_ids:
        return []
    if db.bind is not None and db.bind.dialect.name == "sqlite":
        terms = _tokens(query)
        if not terms:
            return []
        candidates = await _eligible_chunks(db, notebook_id, selected_source_ids)
        scored = [(len(terms & _tokens(chunk.text)), chunk) for chunk in candidates]
        return [chunk for score, chunk in sorted(scored, key=lambda item: -item[0]) if score][
            :limit
        ]
    tsquery = func.plainto_tsquery("english", query)
    result = await db.scalars(
        select(Chunk)
        .join(Source, Source.id == Chunk.source_id)
        .where(
            Chunk.notebook_id == notebook_id,
            Chunk.source_id.in_(selected_source_ids),
            Source.notebook_id == notebook_id,
            Source.selected.is_(True),
            Source.status == "ready",
            Chunk.tsv.op("@@")(tsquery),
        )
        .order_by(func.ts_rank_cd(Chunk.tsv, tsquery).desc())
        .limit(limit)
    )
    return list(result.all())


def rrf_merge(*rankings: list[Chunk], limit: int = 8, k: int = RRF_K) -> list[Chunk]:
    if k <= 0:
        raise ValueError("RRF k must be positive")
    scores: dict[str, float] = {}
    chunks: dict[str, Chunk] = {}
    for ranking in rankings:
        for rank, chunk in enumerate(ranking, start=1):
            scores[chunk.id] = scores.get(chunk.id, 0.0) + 1 / (k + rank)
            chunks[chunk.id] = chunk
    return [chunks[key] for key in sorted(scores, key=lambda key: (-scores[key], key))[:limit]]


def rrf_merge_modalities(
    text_ranking: list[Chunk], image_ranking: list[MediaItem], limit: int = 24, k: int = RRF_K
) -> list[Chunk | MediaItem]:
    """Fuse independently ranked modality lists using rank contributions only."""
    if k <= 0:
        raise ValueError("RRF k must be positive")
    scores: dict[str, float] = {}
    evidence: dict[str, Chunk | MediaItem] = {}
    def contribute(ranking: list[Evidence]) -> None:
        for rank, item in enumerate(ranking, start=1):
            scores[item.id] = scores.get(item.id, 0.0) + 1 / (k + rank)
            evidence[item.id] = item

    contribute(text_ranking)
    contribute(image_ranking)
    return [evidence[key] for key in sorted(scores, key=lambda key: (-scores[key], key))[:limit]]


async def condense_query(
    query: str, history: list[dict[str, str]], cheap_llm: LLMProvider | None
) -> str:
    """Resolve conversational references without granting past turns authority over sources."""
    if not history or cheap_llm is None:
        return query
    messages = [
        {
            "role": "system",
            "content": (
                "Rewrite the latest question as a standalone retrieval query. "
                "Return only the query. Do not answer it or add facts."
            ),
        },
        *history,
        {"role": "user", "content": query},
    ]
    try:
        result = "".join([part async for part in cheap_llm.stream(messages)]).strip()
    except Exception:
        return query
    return result[:300] or query


async def media_vector_search(
    db: AsyncSession,
    embedding: EmbeddingProvider,
    notebook_id: str,
    selected_source_ids: list[str],
    query: str,
    dim: int,
    limit: int = 12,
) -> list[MediaItem]:
    """Rank image candidates within their modality; never compare scores to text scores."""
    if not selected_source_ids:
        return []
    vector = (await embedding.embed([query], "query", dim))[0]
    result = await db.scalars(
        select(MediaItem)
        .where(
            MediaItem.notebook_id == notebook_id,
            MediaItem.source_id.in_(selected_source_ids),
            MediaItem.modality == "image",
        )
        .order_by(MediaItem.embedding.cosine_distance(vector))
        .limit(limit)
    )
    return list(result.all())


async def select_context(
    db: AsyncSession,
    embedding: EmbeddingProvider,
    notebook_id: str,
    selected_source_ids: list[str],
    query: str,
    *,
    dim: int = 768,
    context_window: int = 8192,
    limit: int = 8,
    reranker: Reranker | None = None,
    multimodal_enabled: bool = False,
) -> ContextSelection:
    """Select only ready, persisted-selected sources for one notebook."""
    if not selected_source_ids:
        return ContextSelection([], {}, "empty", query)
    sources = list(
        (
            await db.scalars(
                select(Source).where(
                    Source.notebook_id == notebook_id,
                    Source.id.in_(selected_source_ids),
                    Source.selected.is_(True),
                    Source.status == "ready",
                )
            )
        ).all()
    )
    names = {source.id: source.name for source in sources}
    if not names:
        return ContextSelection([], {}, "empty", query)
    selected_ids = list(names)
    all_chunks = await _eligible_chunks(db, notebook_id, selected_ids)
    if not all_chunks:
        return ContextSelection([], names, "empty", query)
    budget = max(1024, min(int(context_window * 0.55), context_window - 2048))
    total = sum(estimate_tokens(chunk.text) + 32 for chunk in all_chunks)
    if total <= budget and not multimodal_enabled:
        return ContextSelection(all_chunks, names, "full", query)
    vectors = await vector_search(db, embedding, notebook_id, selected_ids, query, dim)
    lexical = await fts_search(db, notebook_id, selected_ids, query)
    text_ranked = rrf_merge(vectors, lexical, limit=max(limit * 2, 12))
    media = (
        await media_vector_search(db, embedding, notebook_id, selected_ids, query, dim)
        if multimodal_enabled
        else []
    )
    mixed = rrf_merge_modalities(text_ranked, media, limit=max(limit * 3, 18))
    selected_media = [item for item in mixed if isinstance(item, MediaItem)][:4]
    merged = [item for item in mixed if isinstance(item, Chunk)]
    if total <= budget:
        return ContextSelection(
            all_chunks, names, "multimodal-full" if media else "full", query, selected_media
        )
    reranked = await (reranker or NoopReranker()).rerank(query, merged)
    chosen: list[Chunk] = []
    used = 0
    for chunk in reranked:
        cost = estimate_tokens(chunk.text) + 32
        if used + cost > budget and chosen:
            continue
        chosen.append(chunk)
        used += cost
        if len(chosen) >= limit:
            break
    return ContextSelection(
        chosen, names, "multimodal" if media else "hybrid", query, selected_media
    )
