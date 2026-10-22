import asyncio
import json
import os
import tempfile
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from arq.connections import RedisSettings
from arq.cron import cron
from arq.worker import Retry
from opennotebook_core.artifacts import FakeArtifactLLM, generate_artifact
from opennotebook_core.audio import (
    AudioJobCancelled,
    AudioLLM,
    AudioOverview,
    FakeLLMForAudio,
    TimedAudioLine,
    generate_script,
    run_with_semaphore,
    word_count,
)
from opennotebook_core.chunking import chunk_document
from opennotebook_core.config import get_settings
from opennotebook_core.db import make_session_factory
from opennotebook_core.embeddings import make_embedding
from opennotebook_core.extractors import (
    EXTRACTORS,
    AudioExtractor,
    extract_figures,
    extract_youtube_transcript,
    parse_youtube_id,
)
from opennotebook_core.models import (
    Artifact,
    Chunk,
    Job,
    MediaItem,
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
from opennotebook_core.tts import make_tts_provider, mp3_duration, stitch_mp3
from redis.asyncio import Redis
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession


def _retry_delay(ctx: dict[str, Any], settings: Any) -> int | None:
    """Return exponential retry delay; terminal failed DB rows are the dead-letter record."""
    attempt = int(ctx.get("job_try", settings.job_max_tries))
    if attempt >= int(settings.job_max_tries):
        return None
    return int(min(2 ** max(0, attempt - 1), 60))


async def _publish(
    ctx: dict[str, Any],
    notebook_id: str,
    source_id: str,
    stage: str,
    progress: int,
    error: str | None = None,
    eta_seconds: int | None = None,
) -> None:
    owned = ctx.get("redis") is None
    redis: Any = ctx.get("redis") or Redis.from_url(get_settings().redis_url)
    try:
        await redis.publish(
            f"notebook:{notebook_id}:events",
            json.dumps(
                {
                    "source_id": source_id,
                    "stage": stage,
                    "progress": progress,
                    "eta_seconds": eta_seconds,
                    "error": error,
                }
            ),
        )
    finally:
        if owned:
            await redis.aclose()


def _eta_seconds(started_at: float, progress: int, now: float | None = None) -> int:
    if progress <= 0 or progress >= 100:
        return 0
    elapsed = (time.monotonic() if now is None else now) - started_at
    return max(0, int(elapsed * (100 - progress) / progress))


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
        started_at = ctx.setdefault("source_started_at", {}).setdefault(source_id, time.monotonic())
        eta = _eta_seconds(started_at, progress)
        await _publish(ctx, source.notebook_id, source.id, stage, progress, error, eta)
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
        source_data: bytes | None = None
        transcript_source: str | None = None
        if source.kind in {"web", "youtube"}:
            if not source.url:
                raise ValueError("Source URL is missing")
            if source.kind == "youtube":
                await _stage(ctx, source_id, job_id, "extracting", 20)
                try:
                    document = await asyncio.to_thread(extract_youtube_transcript, source.url)
                    transcript_source = "youtube"
                except Exception:
                    video_id = parse_youtube_id(source.url)
                    with tempfile.TemporaryDirectory(prefix="open-notebook-youtube-") as folder:
                        target = f"{folder}/audio.%(ext)s"

                        def download_audio() -> tuple[bytes, str]:
                            import yt_dlp  # type: ignore[import-untyped]

                            options: dict[str, object] = {
                                "format": "bestaudio/best",
                                "outtmpl": target,
                                "noplaylist": True,
                                "max_filesize": 150 * 1024 * 1024,
                                "socket_timeout": 20,
                                "retries": 2,
                                "quiet": True,
                                "no_warnings": True,
                            }
                            with yt_dlp.YoutubeDL(options) as downloader:
                                downloader.download([f"https://www.youtube.com/watch?v={video_id}"])
                            paths = [
                                os.path.join(folder, name)
                                for name in os.listdir(folder)
                                if name.startswith("audio.")
                            ]
                            if not paths:
                                raise ValueError("YouTube audio download produced no file")
                            with open(paths[0], "rb") as media_file:
                                return media_file.read(), os.path.splitext(paths[0])[1]

                        media, media_suffix = await asyncio.to_thread(download_audio)
                    document = await asyncio.to_thread(
                        AudioExtractor().extract, media, media_suffix
                    )
                    transcript_source = "whisper"
            else:
                data = await fetcher(source.url)
                source_data = data
                await _stage(ctx, source_id, job_id, "extracting", 20)
                document = await asyncio.to_thread(EXTRACTORS[source.kind].extract, data)
        else:
            if not source.storage_key:
                raise ValueError("Source file is missing")
            data = await storage.get(source.storage_key)
            source_data = data
            await _stage(ctx, source_id, job_id, "extracting", 20)
            if source.kind == "audio":
                suffix = os.path.splitext(source.name)[1]
                document = await asyncio.to_thread(AudioExtractor().extract, data, suffix)
            else:
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
        vectors: list[list[float]] = []
        batch_size = settings.embed_batch_size
        texts = [span.text for span in spans]
        for offset in range(0, len(texts), batch_size):
            vectors.extend(
                await embedding.embed(
                    texts[offset : offset + batch_size], "document", settings.embed_dim
                )
            )
            completed = min(offset + batch_size, len(texts))
            progress = 60 + int(25 * completed / len(texts))
            await _stage(ctx, source_id, job_id, "embedding", progress)
        if len(vectors) != len(spans):
            raise ValueError("Embedding service returned the wrong number of vectors")
        figures = (
            extract_figures(source.kind, source_data)
            if settings.multimodal_enabled
            and settings.multimodal_image_enabled
            and source_data is not None
            and source.kind in {"pdf", "pptx"}
            else []
        )
        figure_vectors: list[list[float]] = []
        if figures:
            embed_media = getattr(embedding, "embed_images", None)
            if embed_media is None:
                raise ValueError("Multimodal image embedding requires the gemma2 embed service")
            figure_vectors = await embed_media(
                [figure.data for figure in figures],
                [figure.text_anchor for figure in figures],
                settings.embed_dim,
            )
            if len(figure_vectors) != len(figures):
                raise ValueError("Embedding service returned the wrong number of figure vectors")
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
            await session.execute(delete(MediaItem).where(MediaItem.source_id == source_id))
            dialect = session.bind.dialect.name if session.bind else "postgresql"
            for ordinal, (span, vector) in enumerate(zip(spans, vectors, strict=True)):
                chunk = Chunk(
                    source_id=source_id,
                    notebook_id=record.notebook_id,
                    ordinal=ordinal,
                    text=span.text,
                    page_start=span.page_start,
                    page_end=span.page_end,
                    time_start=span.time_start,
                    time_end=span.time_end,
                    char_start=span.char_start,
                    char_end=span.char_end,
                    heading_path=list(span.heading_path),
                    embedding=vector,
                    metadata_json={},
                )
                if dialect == "postgresql":
                    chunk.tsv = func.to_tsvector("english", span.text)
                session.add(chunk)
            for figure, vector in zip(figures, figure_vectors, strict=True):
                media_id = str(uuid.uuid4())
                extension = "jpg" if figure.mime_type == "image/jpeg" else "png"
                key = f"media/{source_id}/{media_id}.{extension}"
                await storage.put(key, figure.data)
                session.add(
                    MediaItem(
                        id=media_id,
                        source_id=source_id,
                        notebook_id=record.notebook_id,
                        storage_key=key,
                        text_anchor=figure.text_anchor,
                        page=figure.page,
                        bbox=figure.bbox,
                        modality="image",
                        embedding=vector,
                    )
                )
            record.extracted_text = document.text
            if transcript_source is not None:
                record.metadata_json = {
                    **record.metadata_json,
                    "transcript_source": transcript_source,
                }
            if document.ocr_pages:
                record.metadata_json = {
                    **record.metadata_json,
                    "ocr_pages": list(document.ocr_pages),
                }
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
        delay = _retry_delay(ctx, settings)
        if delay is None:
            message = f"Dead-lettered after {settings.job_max_tries} attempts: {message}"[:500]
        await _stage(ctx, source_id, job_id, "failed", 0, message)
        if delay is not None:
            raise Retry(defer=delay) from exc
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
        delay = _retry_delay(ctx, settings)
        if delay is not None:
            raise Retry(defer=delay) from exc
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
        detail = str(exc)[:450]
        delay = _retry_delay(ctx, settings)
        if delay is None:
            detail = f"Dead-lettered after {settings.job_max_tries} attempts: {detail}"
        await _finish_job(factory, job_id, status="failed", error=detail)
        if delay is not None:
            raise Retry(defer=delay) from exc
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
        delay = _retry_delay(ctx, settings)
        if delay is None:
            async with factory() as session:
                job = await session.get(Job, job_id)
                if job is not None:
                    job.error = f"Dead-lettered after {settings.job_max_tries} attempts: {exc}"[
                        :500
                    ]
                    await session.commit()
            return notebook_id
        raise Retry(defer=delay) from exc


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


async def _artifact_stage(
    ctx: dict[str, Any], artifact_id: str, stage: str, progress: int, error: str | None = None
) -> None:
    factory = ctx.get("session_factory") or make_session_factory(get_settings())
    async with factory() as session:
        artifact = await session.get(Artifact, artifact_id)
        if artifact is None:
            return
        if artifact.status == "cancelled" and stage != "cancelled":
            return
        artifact.stage = stage
        artifact.status = (
            "failed"
            if stage == "failed"
            else "ready"
            if stage == "ready"
            else "cancelled"
            if stage == "cancelled"
            else "running"
        )
        artifact.progress = progress
        artifact.error = error
        job = await session.get(Job, artifact.job_id) if artifact.job_id else None
        if job is not None:
            job.stage = stage
            job.status = (
                "failed"
                if stage == "failed"
                else "succeeded"
                if stage == "ready"
                else "cancelled"
                if stage == "cancelled"
                else "running"
            )
            job.progress = progress
            job.error = error
        await session.commit()
        owned = ctx.get("redis") is None
        redis: Any = ctx.get("redis") or Redis.from_url(get_settings().redis_url)
        try:
            await redis.publish(
                f"notebook:{artifact.notebook_id}:artifact-events",
                json.dumps(
                    {
                        "artifact_id": artifact.id,
                        "stage": stage,
                        "progress": progress,
                        "error": error,
                    }
                ),
            )
        finally:
            if owned:
                await redis.aclose()


async def generate_text_artifact(ctx: dict[str, Any], artifact_id: str) -> str:
    settings = ctx.get("settings") or get_settings()
    factory = ctx.get("session_factory") or make_session_factory(settings)
    try:
        await _artifact_stage(ctx, artifact_id, "reading", 10)
        async with factory() as session:
            artifact = await session.get(Artifact, artifact_id)
            if artifact is None:
                return artifact_id
            notebook = await session.get(Notebook, artifact.notebook_id)
            if notebook is None or notebook.user_id != artifact.user_id:
                raise ValueError("Artifact notebook was not found")
            sources = list(
                (
                    await session.scalars(
                        select(Source).where(
                            Source.notebook_id == artifact.notebook_id,
                            Source.user_id == artifact.user_id,
                            Source.id.in_(artifact.source_ids),
                            Source.selected.is_(True),
                            Source.status == "ready",
                        )
                    )
                ).all()
            )
            if len(sources) != len(artifact.source_ids):
                raise ValueError("An artifact source is no longer selected or ready")
            chunks = list(
                (
                    await session.scalars(
                        select(Chunk)
                        .where(
                            Chunk.notebook_id == artifact.notebook_id,
                            Chunk.source_id.in_(artifact.source_ids),
                        )
                        .order_by(Chunk.source_id, Chunk.ordinal)
                    )
                ).all()
            )
            row = await session.get(UserSettings, artifact.user_id)
            artifact_llm = ctx.get("artifact_llm")
            if artifact_llm is None and settings.llm_provider == "fake":
                llm, model = FakeArtifactLLM(), "fake"
            elif artifact_llm is not None:
                llm, model = artifact_llm
            else:
                llm, model = configured_summary_llm(
                    settings,
                    row,
                    model_override=str(artifact.options_json.get("model_override") or ""),
                )
            recipe = artifact.recipe
            options = {
                **artifact.options_json,
                "persona": notebook.persona or "clear research assistant",
                "response_length": notebook.response_length,
            }
            source_names = {source.id: source.name for source in sources}
        await _artifact_stage(ctx, artifact_id, "mapping", 30)
        document, citations = await generate_artifact(
            recipe,
            chunks,
            source_names,
            options,
            llm,
            max_input_bytes=settings.artifact_map_max_bytes,
            progress=lambda stage, value: _artifact_stage(ctx, artifact_id, stage, value),
        )
        await _artifact_stage(ctx, artifact_id, "saving", 90)
        async with factory() as session:
            artifact = await session.get(Artifact, artifact_id)
            if artifact is None:
                return artifact_id
            artifact.output_json = document.model_dump()
            artifact.citations_json = list(citations)
            artifact.model_name = model
            await session.commit()
        await _artifact_stage(ctx, artifact_id, "ready", 100)
    except Exception as exc:
        delay = _retry_delay(ctx, settings)
        await _artifact_stage(
            ctx,
            artifact_id,
            "failed",
            0,
            (
                f"Dead-lettered after {settings.job_max_tries} attempts: {exc}"
                if delay is None
                else str(exc)
            )[:500]
            or "Artifact generation failed",
        )
        if delay is not None:
            raise Retry(defer=delay) from exc
    return artifact_id


async def generate_audio_overview(ctx: dict[str, Any], artifact_id: str) -> str:
    """Outline, script, check support, synthesize, stitch and store a podcast overview."""
    settings = ctx.get("settings") or get_settings()
    factory = ctx.get("session_factory") or make_session_factory(settings)
    storage = ctx.get("storage") or make_storage(settings)
    redis: Any = ctx.get("redis") or Redis.from_url(settings.redis_url)
    owns_redis = ctx.get("redis") is None
    try:
        async with factory() as session:
            artifact = await session.get(Artifact, artifact_id)
            if artifact is None:
                return artifact_id
            sources = list(
                (
                    await session.scalars(
                        select(Source).where(
                            Source.notebook_id == artifact.notebook_id,
                            Source.user_id == artifact.user_id,
                            Source.id.in_(artifact.source_ids),
                            Source.selected.is_(True),
                            Source.status == "ready",
                        )
                    )
                ).all()
            )
            if len(sources) != len(artifact.source_ids):
                raise ValueError("An audio source is no longer selected or ready")
            chunks = list(
                (
                    await session.scalars(
                        select(Chunk)
                        .where(
                            Chunk.notebook_id == artifact.notebook_id,
                            Chunk.source_id.in_(artifact.source_ids),
                        )
                        .order_by(Chunk.source_id, Chunk.ordinal)
                    )
                ).all()
            )
            row = await session.get(UserSettings, artifact.user_id)
            configured_audio_llm = ctx.get("audio_llm")
            llm: AudioLLM
            if configured_audio_llm is None:
                if settings.llm_provider == "fake":
                    llm, model = FakeLLMForAudio(), "fake"
                else:
                    llm, model = configured_summary_llm(
                        settings,
                        row,
                        model_override=str(artifact.options_json.get("model_override") or ""),
                    )
            elif isinstance(configured_audio_llm, tuple):
                llm, model = configured_audio_llm
            else:
                llm, model = configured_audio_llm, "fake"
            source_names = {source.id: source.name for source in sources}
            notebook_id = artifact.notebook_id
            options = dict(artifact.options_json)
            evidence = [
                {
                    "ref": index,
                    "source": source_names.get(chunk.source_id, "Source"),
                    "page": chunk.page_start,
                    "text": chunk.text[:1800],
                }
                for index, chunk in enumerate(chunks[:40], 1)
            ]
        if not evidence:
            raise ValueError("No indexed source text is available for this audio overview")

        async def cancelled() -> bool:
            return bool(await redis.get(f"audio:cancel:{artifact_id}"))

        async def stage(name: str, progress: int) -> bool:
            if await cancelled():
                await _artifact_stage(ctx, artifact_id, "cancelled", progress, "Cancelled by user")
                return False
            await _artifact_stage(ctx, artifact_id, name, progress)
            return True

        if not await stage("outline", 10):
            return artifact_id

        async def generation_progress(name: str) -> bool:
            return await stage(name, 25 if name == "script" else 40)

        try:
            script, lines, target_words = await generate_script(
                llm, evidence, options, progress=generation_progress
            )
        except AudioJobCancelled:
            return artifact_id
        # generate_script runs the line-level support pass and drops every unsupported line.
        if not await stage("tts", 45):
            return artifact_id
        tts = ctx.get("tts_provider") or make_tts_provider(
            settings.tts_provider,
            base_url=settings.tts_url,
            api_key=settings.openai_api_key,
            model=settings.openai_tts_model,
        )

        async def synthesize() -> list[bytes]:
            segments: list[bytes] = []
            total = len(lines)
            for index, line in enumerate(lines):
                if await cancelled():
                    break
                if settings.tts_provider == "openai":
                    voice = "nova" if line.speaker == "Maya" else "onyx"
                else:
                    language = str(options.get("language", "English"))
                    voices = {
                        "English": ("af_heart", "am_michael"),
                        "British English": ("bf_alice", "bm_fable"),
                        "Spanish": ("ef_dora", "em_alex"),
                        "French": ("ff_siwis", "fm_alex"),
                        "Hindi": ("hf_alpha", "hm_omega"),
                    }
                    if language not in voices:
                        raise ValueError("Choose a language supported by the audio service")
                    voice = voices[language][0 if line.speaker == "Maya" else 1]
                segments.append(
                    await tts.synthesize(line.text, voice, str(options.get("language", "English")))
                )
                await _artifact_stage(ctx, artifact_id, "tts", 45 + int(30 * (index + 1) / total))
            return segments

        segments = await run_with_semaphore(
            redis, synthesize, slots=settings.tts_concurrency, timeout=1800
        )
        if await cancelled():
            await _artifact_stage(ctx, artifact_id, "cancelled", 75, "Cancelled by user")
            return artifact_id
        if not segments:
            raise ValueError("Text-to-speech returned no audio")
        if not await stage("stitch", 82):
            return artifact_id
        spoken_words = word_count(lines)
        expected_seconds = spoken_words / 150 * 60
        mp3 = await asyncio.to_thread(stitch_mp3, segments, expected_seconds=expected_seconds)
        duration = await asyncio.to_thread(mp3_duration, mp3)
        if abs(duration - expected_seconds) > expected_seconds * 0.10:
            raise ValueError("Stitched MP3 duration is outside the requested speech length")
        if not await stage("store", 94):
            return artifact_id
        key = f"audio/{artifact.user_id if artifact else 'unknown'}/{artifact_id}.mp3"
        await storage.put(key, mp3)
        citations = [
            {
                "n": ref,
                "chunk_id": chunks[ref - 1].id,
                "source_id": chunks[ref - 1].source_id,
                "page_start": chunks[ref - 1].page_start,
                "char_start": chunks[ref - 1].char_start,
                "char_end": chunks[ref - 1].char_end,
                "source_name": source_names.get(chunks[ref - 1].source_id, "Source"),
                "quote": chunks[ref - 1].text[:500],
            }
            for ref in sorted({ref for line in lines for ref in line.citation_refs})
        ]
        elapsed = 0.0
        transcript: list[TimedAudioLine] = []
        for line in lines:
            line_duration = len(line.text.split()) / 150 * 60
            transcript.append(
                TimedAudioLine(
                    speaker=line.speaker,
                    text=line.text,
                    citation_refs=line.citation_refs,
                    start=elapsed,
                    end=elapsed + line_duration,
                )
            )
            elapsed += line_duration
        output = AudioOverview(
            title=script.title,
            transcript=transcript,
            duration_seconds=duration,
            target_words=target_words,
            storage_key=key,
        )
        await _artifact_stage(ctx, artifact_id, "saving", 98)
        async with factory() as session:
            artifact = await session.get(Artifact, artifact_id)
            if artifact is None:
                await storage.delete(key)
                return artifact_id
            was_cancelled = await cancelled()
            if not was_cancelled:
                finalized = await session.execute(
                    update(Artifact)
                    .where(
                        Artifact.id == artifact_id,
                        Artifact.status.in_(["queued", "running"]),
                    )
                    .values(
                        output_json=output.model_dump(),
                        citations_json=citations,
                        model_name=model,
                        status="ready",
                        stage="ready",
                        progress=100,
                        error=None,
                    )
                )
                was_cancelled = bool(getattr(finalized, "rowcount", 0) != 1)
            if was_cancelled:
                await session.execute(
                    update(Artifact)
                    .where(
                        Artifact.id == artifact_id,
                        Artifact.status.in_(["queued", "running"]),
                    )
                    .values(
                        status="cancelled",
                        stage="cancelled",
                        progress=0,
                        error="Cancelled by user",
                        output_json=None,
                        citations_json=[],
                    )
                )
                await storage.delete(key)
            else:
                job = await session.get(Job, artifact.job_id) if artifact.job_id else None
                if job is not None:
                    job.status = "succeeded"
                    job.stage = "ready"
                    job.progress = 100
                    job.error = None
            await session.commit()
        await redis.publish(
            f"notebook:{notebook_id}:artifact-events",
            json.dumps(
                {
                    "artifact_id": artifact_id,
                    "stage": "cancelled" if was_cancelled else "ready",
                    "progress": 0 if was_cancelled else 100,
                    "error": "Cancelled by user" if was_cancelled else None,
                }
            ),
        )
    except AudioJobCancelled:
        await _artifact_stage(ctx, artifact_id, "cancelled", 0, "Cancelled by user")
    except Exception as exc:
        delay = _retry_delay(ctx, settings)
        await _artifact_stage(
            ctx,
            artifact_id,
            "failed",
            0,
            (
                f"Dead-lettered after {settings.job_max_tries} attempts: {exc}"
                if delay is None
                else str(exc)
            )[:500]
            or "Audio generation failed",
        )
        if delay is not None:
            raise Retry(defer=delay) from exc
    finally:
        if owns_redis:
            await redis.aclose()
    return artifact_id


async def cleanup_orphaned_storage(ctx: dict[str, Any]) -> int:
    """Remove unreferenced storage objects only after a safety grace period."""
    settings = ctx.get("settings") or get_settings()
    factory = ctx.get("session_factory") or make_session_factory(settings)
    storage = ctx.get("storage") or make_storage(settings)
    referenced: set[str] = set()
    async with factory() as session:
        for value in (await session.scalars(select(Source.storage_key))).all():
            if isinstance(value, str):
                referenced.add(value)
        for value in (await session.scalars(select(MediaItem.storage_key))).all():
            if isinstance(value, str):
                referenced.add(value)
        for payload in (await session.scalars(select(Artifact.output_json))).all():
            if isinstance(payload, dict):
                key = payload.get("storage_key")
                if isinstance(key, str):
                    referenced.add(key)
    cutoff = time.time() - settings.orphan_file_grace_hours * 3600
    objects = await storage.list_objects()
    removed = 0
    for key, modified_at in objects.items():
        if key not in referenced and modified_at < cutoff:
            await storage.delete(key)
            removed += 1
    return removed


async def cleanup_deleted_notebooks(ctx: dict[str, Any]) -> int:
    """Purge notebooks after their owner-visible undo window has expired."""
    settings = ctx.get("settings") or get_settings()
    factory = ctx.get("session_factory") or make_session_factory(settings)
    storage = ctx.get("storage") or make_storage(settings)
    cutoff = datetime.now(UTC) - timedelta(seconds=settings.soft_delete_grace_seconds)
    async with factory() as session:
        expired = list(
            (
                await session.scalars(
                    select(Notebook).where(
                        Notebook.deleted_at.is_not(None), Notebook.deleted_at <= cutoff
                    )
                )
            ).all()
        )
        purged = 0
        for notebook in expired:
            keys: set[str] = set()
            for model in (Source, MediaItem):
                values = await session.scalars(
                    select(model.storage_key).where(model.notebook_id == notebook.id)
                )
                keys.update(value for value in values.all() if isinstance(value, str))
            for output in await session.scalars(
                select(Artifact.output_json).where(Artifact.notebook_id == notebook.id)
            ):
                if isinstance(output, dict):
                    key = output.get("storage_key")
                    if isinstance(key, str):
                        keys.add(key)
            for key in keys:
                await storage.delete(key)
            await session.delete(notebook)
            purged += 1
        await session.commit()
    return purged


async def startup(ctx: dict[str, Any]) -> None:
    settings = get_settings()
    ctx["settings"] = settings
    ctx["session_factory"] = make_session_factory(settings)


async def shutdown(ctx: dict[str, Any]) -> None:
    factory = ctx.get("session_factory")
    if factory is not None:
        await factory.kw["bind"].dispose()


class WorkerSettings:
    functions = [
        ping,
        ingest_source,
        reindex_notebook,
        summarize_source,
        refresh_notebook_overview,
        generate_text_artifact,
        generate_audio_overview,
    ]
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    max_jobs = get_settings().worker_concurrency
    job_timeout = 3600
    max_tries = get_settings().job_max_tries
    cron_jobs = [
        cron(cleanup_orphaned_storage, hour=3, minute=17),
        cron(cleanup_deleted_notebooks, second={0, 15, 30, 45}, unique=False),
    ]
    on_startup = startup
    on_shutdown = shutdown
