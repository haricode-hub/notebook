import asyncio
import json
from typing import Any

from arq.connections import RedisSettings
from opennotebook_core.chunking import chunk_document
from opennotebook_core.config import get_settings
from opennotebook_core.db import make_session_factory
from opennotebook_core.embeddings import make_embedding
from opennotebook_core.extractors import EXTRACTORS
from opennotebook_core.models import (
    Chunk,
    Job,
    Notebook,
    NotebookOverview,
    Source,
    SourceGuide,
    SummaryCache,
    UserSettings,
)
from opennotebook_core.queue import enqueue_source_guide, schedule_overview
from opennotebook_core.safe_fetch import fetch_public_url
from opennotebook_core.storage import make_storage
from opennotebook_core.summarization import cache_key, configured_summary_llm, summarize_text
from redis.asyncio import Redis
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession


async def _publish(
    ctx: dict[str, Any],
    notebook_id: str,
    source_id: str,
    stage: str,
    progress: int,
    error: str | None = None,
) -> None:
    owned = ctx.get("redis") is None
    redis: Any = ctx.get("redis") or Redis.from_url(get_settings().redis_url)
    try:
        await redis.publish(
            f"notebook:{notebook_id}:events",
            json.dumps(
                {"source_id": source_id, "stage": stage, "progress": progress, "error": error}
            ),
        )
    finally:
        if owned:
            await redis.aclose()


async def _stage(
    ctx: dict[str, Any],
    source_id: str,
    job_id: str,
    stage: str,
    progress: int,
    error: str | None = None,
) -> Source:
    factory = ctx.get("session_factory") or make_session_factory(get_settings())
    async with factory() as session:
        source = await session.get(Source, source_id)
        job = await session.get(Job, job_id)
        if source is None or job is None:
            raise ValueError("source or job not found")
        source.status = stage
        source.progress = progress
        source.error = error
        job.stage = stage
        job.progress = progress
        job.status = (
            "failed" if stage == "failed" else "succeeded" if stage == "ready" else "running"
        )
        job.error = error
        await session.commit()
        await _publish(ctx, source.notebook_id, source.id, stage, progress, error)
        return source


async def ingest_source(
    ctx: dict[str, Any], source_id: str, job_id: str, reindex: bool = False
) -> str:
    """Replace one source's chunks atomically after extraction and embedding succeed."""
    settings = ctx.get("settings") or get_settings()
    factory = ctx.get("session_factory") or make_session_factory(settings)
    storage = ctx.get("storage") or make_storage(settings)
    embedding = ctx.get("embedding") or make_embedding(settings)
    fetcher = ctx.get("fetcher") or fetch_public_url
    try:
        source = await _stage(ctx, source_id, job_id, "fetching", 5)
        if source.kind == "web":
            if not source.url:
                raise ValueError("Website URL is missing")
            data = await fetcher(source.url)
        else:
            if not source.storage_key:
                raise ValueError("Source file is missing")
            data = await storage.get(source.storage_key)
        await _stage(ctx, source_id, job_id, "extracting", 20)
        document = await asyncio.to_thread(EXTRACTORS[source.kind].extract, data)
        await _stage(ctx, source_id, job_id, "chunking", 40)
        spans = chunk_document(document)
        if not spans:
            raise ValueError("No readable text was found in this source")
        identity = "fake" if settings.embed_backend == "fake" else "google/embeddinggemma-2"
        if not reindex:
            async with factory() as session:
                others = (
                    await session.scalars(
                        select(Source).where(
                            Source.notebook_id == source.notebook_id,
                            Source.id != source.id,
                            Source.status == "ready",
                        )
                    )
                ).all()
                if any(
                    (other.embedding_model, other.embedding_dim) != (identity, settings.embed_dim)
                    for other in others
                ):
                    raise ValueError(
                        "Embedding model or dimension changed. Re-index this notebook first"
                    )
        await _stage(ctx, source_id, job_id, "embedding", 60)
        vectors = await embedding.embed(
            [span.text for span in spans], "document", settings.embed_dim
        )
        if len(vectors) != len(spans):
            raise ValueError("Embedding service returned the wrong number of vectors")
        await _stage(ctx, source_id, job_id, "indexing", 90)
        async with factory() as session:
            record = await session.get(Source, source_id)
            if record is None:
                raise ValueError("Source was deleted during ingestion")
            await session.execute(
                select(Notebook.id).where(Notebook.id == record.notebook_id).with_for_update()
            )
            if not reindex:
                other_models = (
                    await session.scalars(
                        select(Source).where(
                            Source.notebook_id == record.notebook_id,
                            Source.id != record.id,
                            Source.embedding_model.is_not(None),
                        )
                    )
                ).all()
                if any(
                    (other.embedding_model, other.embedding_dim) != (identity, settings.embed_dim)
                    for other in other_models
                ):
                    raise ValueError(
                        "Embedding model or dimension changed. Re-index this notebook first"
                    )
            await session.execute(delete(Chunk).where(Chunk.source_id == source_id))
            dialect = session.bind.dialect.name if session.bind else "postgresql"
            for ordinal, (span, vector) in enumerate(zip(spans, vectors, strict=True)):
                chunk = Chunk(
                    source_id=source_id,
                    notebook_id=record.notebook_id,
                    ordinal=ordinal,
                    text=span.text,
                    page_start=span.page_start,
                    page_end=span.page_end,
                    char_start=span.char_start,
                    char_end=span.char_end,
                    heading_path=list(span.heading_path),
                    embedding=vector,
                    metadata_json={},
                )
                if dialect == "postgresql":
                    chunk.tsv = func.to_tsvector("english", span.text)
                session.add(chunk)
            record.extracted_text = document.text
            record.page_count = document.page_count
            record.embedding_model = identity
            record.embedding_dim = settings.embed_dim
            await session.commit()
        await _stage(ctx, source_id, job_id, "ready", 100)
        queue = ctx.get("redis")
        if queue is not None and hasattr(queue, "enqueue_job"):
            async with factory() as session:
                ready_source = await session.get(Source, source_id)
                if ready_source is not None:
                    await enqueue_source_guide(queue, session, ready_source)
        return source_id
    except Exception as exc:
        message = (
            "Website request timed out"
            if isinstance(exc, TimeoutError)
            else str(exc)[:500] or "Source ingestion failed"
        )
        await _stage(ctx, source_id, job_id, "failed", 0, message)
        return source_id


async def _finish_job(
    factory: Any, job_id: str, *, status: str = "succeeded", error: str | None = None
) -> None:
    async with factory() as session:
        job = await session.get(Job, job_id)
        if job is not None:
            job.status = status
            job.stage = "ready" if status == "succeeded" else "failed"
            job.progress = 100 if status == "succeeded" else 0
            job.error = error
            await session.commit()


async def _store_summary_cache(
    session: AsyncSession, key: str, user_id: str, model: str, guide: Any
) -> None:
    values = {
        "cache_key": key,
        "user_id": user_id,
        "summary": guide.summary,
        "topics": guide.topics,
        "questions": guide.questions,
        "model_name": model,
    }
    dialect = session.bind.dialect.name if session.bind else "postgresql"
    if dialect == "sqlite":
        await session.execute(
            sqlite_insert(SummaryCache)
            .values(**values)
            .on_conflict_do_nothing(index_elements=["cache_key"])
        )
    else:
        await session.execute(
            pg_insert(SummaryCache)
            .values(**values)
            .on_conflict_do_nothing(index_elements=["cache_key"])
        )


async def summarize_source(ctx: dict[str, Any], source_id: str, job_id: str) -> str:
    settings = ctx.get("settings") or get_settings()
    factory = ctx.get("session_factory") or make_session_factory(settings)
    try:
        async with factory() as session:
            source = await session.get(Source, source_id)
            if source is None or source.status != "ready" or not source.extracted_text:
                await _finish_job(factory, job_id)
                return source_id
            user_id, notebook_id, text = source.user_id, source.notebook_id, source.extracted_text
            row = await session.get(UserSettings, user_id)
            llm, model = ctx.get("summary_llm") or configured_summary_llm(settings, row)
            key = cache_key(text, user_id=user_id, model_name=model)
            guide = await session.get(SourceGuide, source_id)
            if guide is not None and guide.content_hash == key and guide.status == "ready":
                await _finish_job(factory, job_id)
                return source_id
            cached = await session.get(SummaryCache, key)
        if cached is None:
            result = await summarize_text(text, llm, max_input_bytes=settings.summary_map_max_bytes)
        async with factory() as session:
            source = await session.get(Source, source_id)
            if source is None:
                await _finish_job(factory, job_id)
                return source_id
            guide = await session.get(SourceGuide, source_id)
            if guide is None:
                guide = SourceGuide(
                    source_id=source_id, notebook_id=notebook_id, user_id=user_id, content_hash=key
                )
                session.add(guide)
            guide.content_hash = key
            guide.status = "ready"
            guide.error = None
            guide.summary = cached.summary if cached is not None else result.summary
            guide.topics = cached.topics if cached is not None else result.topics
            guide.questions = cached.questions if cached is not None else result.questions
            guide.model_name = model
            if cached is None:
                await _store_summary_cache(session, key, user_id, model, guide)
            await session.commit()
            queue = ctx.get("redis")
            if queue is not None and hasattr(queue, "enqueue_job"):
                await schedule_overview(queue, session, notebook_id, user_id)
        await _publish(ctx, notebook_id, source_id, "guide_ready", 100)
        await _finish_job(factory, job_id)
    except Exception as exc:
        async with factory() as session:
            source = await session.get(Source, source_id)
            if source is not None:
                guide = await session.get(SourceGuide, source_id)
                if guide is None:
                    guide = SourceGuide(
                        source_id=source_id,
                        notebook_id=source.notebook_id,
                        user_id=source.user_id,
                        content_hash="",
                    )
                    session.add(guide)
                guide.status = "failed"
                guide.error = str(exc)[:500]
                await session.commit()
                await _publish(ctx, source.notebook_id, source_id, "guide_failed", 100, guide.error)
        await _finish_job(factory, job_id, status="failed", error=str(exc)[:500])
    return source_id


async def refresh_notebook_overview(ctx: dict[str, Any], notebook_id: str, job_id: str) -> str:
    settings = ctx.get("settings") or get_settings()
    factory = ctx.get("session_factory") or make_session_factory(settings)
    queue = ctx.get("redis")
    try:
        if queue is not None:
            latest = await queue.get(f"overview-generation:{notebook_id}")
            if latest != job_id.encode():
                await _finish_job(factory, job_id)
                return notebook_id
        async with factory() as session:
            notebook = await session.get(Notebook, notebook_id)
            if notebook is None:
                await _finish_job(factory, job_id)
                return notebook_id
            user_id = notebook.user_id
            guides = list(
                (
                    await session.scalars(
                        select(SourceGuide)
                        .join(Source, Source.id == SourceGuide.source_id)
                        .where(
                            SourceGuide.notebook_id == notebook_id,
                            SourceGuide.user_id == user_id,
                            SourceGuide.status == "ready",
                            Source.status == "ready",
                        )
                        .order_by(SourceGuide.source_id)
                    )
                ).all()
            )
            if not guides:
                await session.execute(
                    delete(NotebookOverview).where(NotebookOverview.notebook_id == notebook_id)
                )
                await session.commit()
                await _finish_job(factory, job_id)
                return notebook_id
            input_text = "\n\n".join(
                json.dumps(
                    {
                        "source_id": guide.source_id,
                        "summary": guide.summary,
                        "topics": guide.topics,
                        "questions": guide.questions,
                    }
                )
                for guide in guides
            )
            row = await session.get(UserSettings, user_id)
            llm, model = ctx.get("summary_llm") or configured_summary_llm(settings, row)
            key = cache_key(input_text, user_id=user_id, model_name=model, overview=True)
            previous = await session.get(NotebookOverview, notebook_id)
            if previous is not None and previous.content_hash == key and previous.status == "ready":
                await _finish_job(factory, job_id)
                return notebook_id
            cached = await session.get(SummaryCache, key)
        if cached is None:
            result = await summarize_text(
                input_text, llm, max_input_bytes=settings.summary_map_max_bytes, overview=True
            )
        async with factory() as session:
            overview = await session.get(NotebookOverview, notebook_id)
            if overview is None:
                overview = NotebookOverview(
                    notebook_id=notebook_id, user_id=user_id, content_hash=key
                )
                session.add(overview)
            overview.content_hash = key
            overview.status = "ready"
            overview.error = None
            overview.summary = cached.summary if cached is not None else result.summary
            overview.topics = cached.topics if cached is not None else result.topics
            overview.questions = cached.questions if cached is not None else result.questions
            overview.model_name = model
            if cached is None:
                await _store_summary_cache(session, key, user_id, model, overview)
            await session.commit()
        await _publish(ctx, notebook_id, "", "overview_ready", 100)
        await _finish_job(factory, job_id)
    except Exception as exc:
        await _finish_job(factory, job_id, status="failed", error=str(exc)[:500])
    return notebook_id


async def reindex_notebook(ctx: dict[str, Any], notebook_id: str, job_id: str) -> str:
    settings = ctx.get("settings") or get_settings()
    factory = ctx.get("session_factory") or make_session_factory(settings)
    embedding = ctx.get("embedding") or make_embedding(settings)
    identity = "fake" if settings.embed_backend == "fake" else "google/embeddinggemma-2"
    try:
        async with factory() as session:
            sources = list(
                (
                    await session.scalars(select(Source).where(Source.notebook_id == notebook_id))
                ).all()
            )
            chunks = list(
                (await session.scalars(select(Chunk).where(Chunk.notebook_id == notebook_id))).all()
            )
        if not chunks:
            raise ValueError("Notebook has no indexed chunks to re-index")
        vectors_by_id: dict[str, list[float]] = {}
        for number, source in enumerate(sources, 1):
            belonging = [chunk for chunk in chunks if chunk.source_id == source.id]
            if belonging:
                vectors = await embedding.embed(
                    [chunk.text for chunk in belonging], "document", settings.embed_dim
                )
                if len(vectors) != len(belonging):
                    raise ValueError("Embedding service returned the wrong number of vectors")
                vectors_by_id.update(
                    (chunk.id, vector) for chunk, vector in zip(belonging, vectors, strict=True)
                )
            progress = int(number / len(sources) * 90)
            async with factory() as session:
                job = await session.get(Job, job_id)
                if job:
                    job.status = "running"
                    job.stage = "reindexing"
                    job.progress = progress
                    await session.commit()
            await _publish(ctx, notebook_id, source.id, "reindexing", progress)
        async with factory() as session:
            for chunk_id, vector in vectors_by_id.items():
                chunk = await session.get(Chunk, chunk_id)
                if chunk:
                    chunk.embedding = vector
            for source in sources:
                record = await session.get(Source, source.id)
                if record and record.embedding_model is not None:
                    record.embedding_model = identity
                    record.embedding_dim = settings.embed_dim
            job = await session.get(Job, job_id)
            if job:
                job.status = "succeeded"
                job.stage = "ready"
                job.progress = 100
            await session.commit()
        for source in sources:
            await _publish(ctx, notebook_id, source.id, "ready", 100)
        return notebook_id
    except Exception as exc:
        async with factory() as session:
            job = await session.get(Job, job_id)
            if job:
                job.status = "failed"
                job.stage = "failed"
                job.error = str(exc)[:500]
                await session.commit()
        await _publish(ctx, notebook_id, "", "failed", 0, str(exc)[:500])
        raise


async def ping(ctx: dict[str, Any], job_id: str) -> str:
    factory = ctx.get("session_factory") or make_session_factory(get_settings())
    async with factory() as session:
        job = await session.get(Job, job_id)
        if job is None:
            raise ValueError("job not found")
        job.status = "succeeded"
        job.result = "pong"
        await session.commit()
    return "pong"


class WorkerSettings:
    functions = [ping, ingest_source, reindex_notebook, summarize_source, refresh_notebook_overview]
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    max_jobs = 2
    job_timeout = 3600
