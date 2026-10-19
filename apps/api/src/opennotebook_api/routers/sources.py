"""Owned source creation, lifecycle, and live progress."""

import logging
import re
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from io import BytesIO
from typing import Annotated
from urllib.parse import urlsplit
from uuid import uuid4
from zipfile import BadZipFile, ZipFile

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from opennotebook_core.discovery import DuckDuckGoSearch
from opennotebook_core.extractors import parse_youtube_id
from opennotebook_core.models import Chunk, Job, MediaItem, Notebook, Source
from opennotebook_core.queue import schedule_overview
from opennotebook_core.safe_fetch import UnsafeURL, validate_url
from opennotebook_core.storage import make_storage, verify_file_token
from pydantic import BaseModel, ConfigDict, Field
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from opennotebook_api.deps.auth import CurrentUser, get_current_user
from opennotebook_api.deps.db import get_db
from opennotebook_api.routers.notebooks import owned_notebook

router = APIRouter(prefix="/notebooks/{notebook_id}", tags=["sources"])
User = Annotated[CurrentUser, Depends(get_current_user)]
Db = Annotated[AsyncSession, Depends(get_db)]


class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    notebook_id: str
    name: str
    kind: str
    status: str
    selected: bool
    progress: int
    error: str | None
    page_count: int | None
    embedding_model: str | None
    embedding_dim: int | None
    ocr_pages: list[int] = Field(default_factory=list)
    created_at: datetime


class TextSourceIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    text: str = Field(min_length=1, max_length=5_000_000)


class URLSourceIn(BaseModel):
    url: str = Field(min_length=10, max_length=2048)


class SourceSelectionIn(BaseModel):
    selected: bool | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)


class SourceChunkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    text: str
    page_start: int | None
    page_end: int | None
    char_start: int
    char_end: int
    time_start: float | None
    time_end: float | None


class SourceContentOut(BaseModel):
    source: SourceOut
    text: str
    chunks: list[SourceChunkOut]
    original_url: str | None
    file_url: str | None
    expires_at: int | None


class DiscoverCandidate(BaseModel):
    title: str
    url: str
    snippet: str


class DiscoverImportIn(BaseModel):
    urls: list[str] = Field(min_length=1, max_length=10)


async def _owned_source(db: AsyncSession, notebook_id: str, user_id: str, source_id: str) -> Source:
    source = (
        await db.scalars(
            select(Source).where(
                Source.id == source_id, Source.notebook_id == notebook_id, Source.user_id == user_id
            )
        )
    ).one_or_none()
    if source is None:
        raise HTTPException(404, "Source not found")
    return source


async def _source_capacity(db: AsyncSession, notebook_id: str, user_limit: int = 250) -> None:
    await db.execute(select(Notebook.id).where(Notebook.id == notebook_id).with_for_update())
    count = await db.scalar(select(func.count(Source.id)).where(Source.notebook_id == notebook_id))
    if count is not None and count >= 50:
        raise HTTPException(409, "A notebook can contain at most 50 sources")
    user_id = await db.scalar(select(Notebook.user_id).where(Notebook.id == notebook_id))
    user_count = await db.scalar(select(func.count(Source.id)).where(Source.user_id == user_id))
    if user_count is not None and user_count >= user_limit:
        raise HTTPException(429, "Your source quota is full. Delete an existing source to continue")


async def _enqueue(
    db: AsyncSession, request: Request, source: Source, *, reindex: bool = False
) -> None:
    job = Job(
        id=str(uuid4()),
        user_id=source.user_id,
        kind="reindex_notebook" if reindex else "ingest_source",
        status="queued",
        stage="queued",
        progress=0,
    )
    db.add(job)
    await db.commit()
    pool: ArqRedis | None = None
    try:
        pool = await create_pool(RedisSettings.from_dsn(request.app.state.settings.redis_url))
        if reindex:
            await pool.enqueue_job("reindex_notebook", source.notebook_id, job.id, _job_id=job.id)
        else:
            await pool.enqueue_job("ingest_source", source.id, job.id, _job_id=job.id)
    except Exception as exc:
        source.status = "failed"
        source.error = "Ingestion queue is unavailable"
        job.status = "failed"
        job.error = source.error
        await db.commit()
        raise HTTPException(503, source.error) from exc
    finally:
        if pool is not None:
            await pool.aclose()


@router.get("/sources", response_model=list[SourceOut])
async def list_sources(notebook_id: str, user: User, db: Db) -> list[Source]:
    await owned_notebook(db, user.id, notebook_id)
    return list(
        (
            await db.scalars(
                select(Source)
                .where(Source.notebook_id == notebook_id, Source.user_id == user.id)
                .order_by(Source.created_at.desc())
            )
        ).all()
    )


@router.post("/sources/text", response_model=SourceOut, status_code=status.HTTP_201_CREATED)
async def add_text(
    notebook_id: str, body: TextSourceIn, request: Request, user: User, db: Db
) -> Source:
    await owned_notebook(db, user.id, notebook_id)
    await _source_capacity(db, notebook_id, request.app.state.settings.source_quota_per_user)
    source = Source(
        id=str(uuid4()),
        notebook_id=notebook_id,
        user_id=user.id,
        name=body.name,
        kind="text",
        status="queued",
        progress=0,
        metadata_json={},
    )
    source.storage_key = f"{user.id}/{notebook_id}/{source.id}.txt"
    storage = make_storage(request.app.state.settings)
    await storage.put(source.storage_key, body.text.encode())
    db.add(source)
    await _enqueue(db, request, source)
    await db.refresh(source)
    return source


@router.post("/sources/url", response_model=SourceOut, status_code=status.HTTP_201_CREATED)
async def add_url(
    notebook_id: str, body: URLSourceIn, request: Request, user: User, db: Db
) -> Source:
    await owned_notebook(db, user.id, notebook_id)
    await _source_capacity(db, notebook_id, request.app.state.settings.source_quota_per_user)
    try:
        validate_url(body.url)
    except UnsafeURL as exc:
        raise HTTPException(422, str(exc)) from exc
    name = (urlsplit(body.url).hostname or "Website")[:255]
    source = Source(
        id=str(uuid4()),
        notebook_id=notebook_id,
        user_id=user.id,
        name=name,
        kind="web",
        url=body.url,
        status="queued",
        progress=0,
        metadata_json={},
    )
    db.add(source)
    await _enqueue(db, request, source)
    await db.refresh(source)
    return source


@router.post("/sources/youtube", response_model=SourceOut, status_code=status.HTTP_201_CREATED)
async def add_youtube(
    notebook_id: str, body: URLSourceIn, request: Request, user: User, db: Db
) -> Source:
    await owned_notebook(db, user.id, notebook_id)
    await _source_capacity(db, notebook_id, request.app.state.settings.source_quota_per_user)
    try:
        video_id = parse_youtube_id(body.url)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    canonical_url = f"https://www.youtube.com/watch?v={video_id}"
    source = Source(
        id=str(uuid4()),
        notebook_id=notebook_id,
        user_id=user.id,
        name=f"YouTube video {video_id}",
        kind="youtube",
        url=canonical_url,
        status="queued",
        progress=0,
        metadata_json={"video_id": video_id},
    )
    db.add(source)
    await _enqueue(db, request, source)
    await db.refresh(source)
    return source


@router.get("/discover", response_model=list[DiscoverCandidate])
async def discover_sources(
    notebook_id: str, q: str, request: Request, user: User, db: Db, limit: int = 8
) -> list[DiscoverCandidate]:
    await owned_notebook(db, user.id, notebook_id)
    if len(q.strip()) < 3 or len(q) > 300 or not 1 <= limit <= 10:
        raise HTTPException(422, "Use a 3–300 character search and a limit from 1 to 10")
    provider = getattr(request.app.state, "search_provider", None) or DuckDuckGoSearch()
    try:
        rows = await provider.search(q, limit)
    except Exception as exc:
        raise HTTPException(502, "Search is temporarily unavailable") from exc
    return [DiscoverCandidate(title=row.title, url=row.url, snippet=row.snippet) for row in rows]


@router.post("/sources/import", response_model=list[SourceOut], status_code=202)
async def import_discovered(
    notebook_id: str,
    body: DiscoverImportIn,
    request: Request,
    user: User,
    db: Db,
) -> list[Source]:
    await owned_notebook(db, user.id, notebook_id)
    count = await db.scalar(select(func.count(Source.id)).where(Source.notebook_id == notebook_id))
    urls = list(dict.fromkeys(body.urls))
    if (count or 0) + len(urls) > 50:
        raise HTTPException(409, "A notebook can contain at most 50 sources")
    safe_urls: list[str] = []
    for value in urls:
        try:
            safe_urls.append(validate_url(value))
        except UnsafeURL as exc:
            raise HTTPException(422, str(exc)) from exc
    created: list[Source] = []
    for safe_url in safe_urls:
        source = Source(
            id=str(uuid4()),
            notebook_id=notebook_id,
            user_id=user.id,
            name=(urlsplit(safe_url).hostname or "Website")[:255],
            kind="web",
            url=safe_url,
            status="queued",
            progress=0,
            metadata_json={"discovered": True},
        )
        db.add(source)
        await db.flush()
        await _enqueue(db, request, source)
        created.append(source)
    return created


@router.post("/sources/upload", response_model=SourceOut, status_code=status.HTTP_201_CREATED)
async def upload_source(
    notebook_id: str, request: Request, user: User, db: Db, file: Annotated[UploadFile, File()]
) -> Source:
    await owned_notebook(db, user.id, notebook_id)
    await _source_capacity(db, notebook_id, request.app.state.settings.source_quota_per_user)
    filename = (
        re.sub(r"[^A-Za-z0-9._ -]", "_", (file.filename or "source")[-255:]).strip(". ") or "source"
    )
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    audio_types = {"mp3", "wav", "m4a", "flac", "ogg", "opus", "webm"}
    if extension not in {"pdf", "docx", "pptx", "txt", "md", "png", "jpg", "jpeg", *audio_types}:
        raise HTTPException(
            415, "Supported files: PDF, DOCX, PPTX, TXT, MD, PNG, JPG, MP3, WAV, M4A, FLAC, OGG"
        )
    kind = "audio" if extension in audio_types else extension
    limit = request.app.state.settings.upload_max_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(
            413, f"File exceeds the {request.app.state.settings.upload_max_mb} MB limit"
        )
    if kind == "pdf" and not data.startswith(b"%PDF-"):
        raise HTTPException(415, "File is not a PDF")
    if kind in {"docx", "pptx"} and not data.startswith(b"PK"):
        raise HTTPException(415, "File is not an Office document")
    if kind in {"png", "jpg", "jpeg"}:
        valid_image = data.startswith(b"\x89PNG\r\n\x1a\n") or data.startswith(b"\xff\xd8\xff")
        if (
            not valid_image
            or (kind == "png" and not data.startswith(b"\x89PNG"))
            or (kind in {"jpg", "jpeg"} and not data.startswith(b"\xff\xd8\xff"))
        ):
            raise HTTPException(415, "File is not a valid PNG or JPEG image")
    if kind in {"docx", "pptx"}:
        try:
            with ZipFile(BytesIO(data)) as archive:
                expected = "word/document.xml" if kind == "docx" else "ppt/presentation.xml"
                if expected not in archive.namelist():
                    raise HTTPException(415, "File content does not match its extension")
                if sum(item.file_size for item in archive.infolist()) > 200 * 1024 * 1024:
                    raise HTTPException(413, "Office document expands beyond the size limit")
        except BadZipFile as exc:
            raise HTTPException(415, "File is not a valid Office document") from exc
    if kind in {"txt", "md"}:
        try:
            data.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise HTTPException(415, "Text file must be UTF-8") from exc
    source = Source(
        id=str(uuid4()),
        notebook_id=notebook_id,
        user_id=user.id,
        name=filename,
        kind=kind,
        mime_type=file.content_type,
        status="queued",
        progress=0,
        metadata_json={},
    )
    source.storage_key = f"{user.id}/{notebook_id}/{source.id}.{kind}"
    await make_storage(request.app.state.settings).put(source.storage_key, data)
    db.add(source)
    await _enqueue(db, request, source)
    await db.refresh(source)
    return source


@router.get("/sources/{source_id}", response_model=SourceOut)
async def get_source(notebook_id: str, source_id: str, user: User, db: Db) -> Source:
    return await _owned_source(db, notebook_id, user.id, source_id)


@router.get("/sources/{source_id}/content", response_model=SourceContentOut)
async def source_content(
    notebook_id: str, source_id: str, request: Request, user: User, db: Db
) -> SourceContentOut:
    source = await _owned_source(db, notebook_id, user.id, source_id)
    chunks = list(
        (
            await db.scalars(
                select(Chunk)
                .where(Chunk.source_id == source_id, Chunk.notebook_id == notebook_id)
                .order_by(Chunk.ordinal)
            )
        ).all()
    )

    file_url = None
    expires_at = None
    if source.storage_key:
        expires_at = int(datetime.now(UTC).timestamp()) + 300
        try:
            file_url = make_storage(request.app.state.settings).url(
                source.storage_key,
                user_id=user.id,
                source_id=source.id,
                expires_at=expires_at,
                signing_key=request.app.state.settings.settings_encryption_key,
            )
        except ValueError as exc:
            raise HTTPException(503, "File URL signing is unavailable") from exc
    return SourceContentOut(
        source=SourceOut.model_validate(source).model_copy(
            update={"ocr_pages": source.metadata_json.get("ocr_pages", [])}
        ),
        text=source.extracted_text or "",
        chunks=[SourceChunkOut.model_validate(chunk) for chunk in chunks],
        original_url=source.url,
        file_url=file_url,
        expires_at=expires_at,
    )


@router.get("/media/{media_item_id}/content")
async def media_content(
    notebook_id: str, media_item_id: str, request: Request, user: User, db: Db
) -> Response:
    await owned_notebook(db, user.id, notebook_id)
    item = await db.scalar(
        select(MediaItem).where(
            MediaItem.id == media_item_id,
            MediaItem.notebook_id == notebook_id,
            MediaItem.modality == "image",
        )
    )
    if item is None:
        raise HTTPException(404, "Figure not found")
    await _owned_source(db, notebook_id, user.id, item.source_id)
    data = await make_storage(request.app.state.settings).get(item.storage_key)
    media_type = (
        "image/jpeg" if item.storage_key.lower().endswith((".jpg", ".jpeg")) else "image/png"
    )
    return Response(data, media_type=media_type, headers={"Cache-Control": "private, no-store"})


files_router = APIRouter(tags=["sources"])


@files_router.get("/files/{token}")
async def signed_file(token: str, request: Request, user: User, db: Db) -> Response:
    try:
        key, source_id = verify_file_token(
            token,
            user_id=user.id,
            signing_key=request.app.state.settings.settings_encryption_key,
        )
    except ValueError as exc:
        raise HTTPException(403, "File URL is invalid or expired") from exc
    source = (
        await db.scalars(
            select(Source).where(
                Source.id == source_id,
                Source.user_id == user.id,
                Source.storage_key == key,
            )
        )
    ).one_or_none()
    if source is None:
        raise HTTPException(404, "File not found")
    try:
        data = await make_storage(request.app.state.settings).get(key)
    except (FileNotFoundError, KeyError) as exc:
        raise HTTPException(404, "File not found") from exc
    media_type = source.mime_type or (
        "application/pdf" if source.kind == "pdf" else "application/octet-stream"
    )
    return Response(
        data,
        media_type=media_type,
        headers={"Cache-Control": "private, no-store", "Content-Disposition": "inline"},
    )


@router.patch("/sources/{source_id}", response_model=SourceOut)
async def select_source(
    notebook_id: str, source_id: str, body: SourceSelectionIn, user: User, db: Db
) -> Source:
    source = await _owned_source(db, notebook_id, user.id, source_id)
    if body.selected is None and body.name is None:
        raise HTTPException(422, "At least one source field is required")
    if body.selected is not None:
        source.selected = body.selected
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(422, "Source name cannot be blank")
        source.name = body.name.strip()
    await db.commit()
    await db.refresh(source)
    return source


@router.post("/sources/{source_id}/retry", response_model=SourceOut)
async def retry_source(
    notebook_id: str, source_id: str, request: Request, user: User, db: Db
) -> Source:
    source = await _owned_source(db, notebook_id, user.id, source_id)
    if source.status not in {"failed", "ready"}:
        raise HTTPException(409, "Source is already processing")
    source.status = "queued"
    source.progress = 0
    source.error = None
    await _enqueue(db, request, source)
    await db.refresh(source)
    return source


@router.delete("/sources/{source_id}", status_code=204)
async def delete_source(
    notebook_id: str, source_id: str, request: Request, user: User, db: Db
) -> None:
    source = await _owned_source(db, notebook_id, user.id, source_id)
    key = source.storage_key
    await db.delete(source)
    await db.commit()
    if key:
        await make_storage(request.app.state.settings).delete(key)
    pool: ArqRedis | None = None
    try:
        pool = await create_pool(RedisSettings.from_dsn(request.app.state.settings.redis_url))
        await schedule_overview(pool, db, notebook_id, user.id)
    except Exception:
        logging.getLogger("opennotebook.api.sources").warning("overview_refresh_queue_unavailable")
    finally:
        if pool is not None:
            await pool.aclose()


@router.post("/reindex", status_code=202)
async def reindex(notebook_id: str, request: Request, user: User, db: Db) -> dict[str, str]:
    await owned_notebook(db, user.id, notebook_id)
    source = (
        await db.scalars(select(Source).where(Source.notebook_id == notebook_id).limit(1))
    ).first()
    if source is None:
        raise HTTPException(409, "Notebook has no sources")
    await _enqueue(db, request, source, reindex=True)
    return {"status": "queued"}


@router.get("/events")
async def source_events(
    notebook_id: str, request: Request, user: User, db: Db
) -> StreamingResponse:
    await owned_notebook(db, user.id, notebook_id)
    redis = Redis.from_url(request.app.state.settings.redis_url)

    async def events() -> AsyncIterator[str]:
        try:
            async with redis.pubsub() as pubsub:
                await pubsub.subscribe(f"notebook:{notebook_id}:events")
                yield ": connected\n\n"
                for _ in range(25):
                    if await request.is_disconnected():
                        break
                    message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1)
                    if message:
                        yield f"data: {message['data'].decode()}\n\n"
                    else:
                        yield ": heartbeat\n\n"
        finally:
            await redis.aclose()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
