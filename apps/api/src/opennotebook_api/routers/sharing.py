"""Hashed, immediately revocable notebook read-only links and ZIP export."""

import hashlib
import io
import json
import secrets
import zipfile
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from opennotebook_core.models import Artifact, Note, Notebook, NotebookShare, Source
from pydantic import BaseModel, Field
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from opennotebook_api.deps.auth import CurrentUser, get_current_user
from opennotebook_api.deps.db import get_db
from opennotebook_api.routers.notebooks import owned_notebook

router = APIRouter(tags=["sharing"])
User = Annotated[CurrentUser, Depends(get_current_user)]
Db = Annotated[AsyncSession, Depends(get_db)]


class ShareCreate(BaseModel):
    expires_in_hours: int | None = Field(default=None, ge=1, le=24 * 90)


class ShareCreated(BaseModel):
    id: str
    token: str
    url_path: str
    expires_at: datetime | None


class PublicSource(BaseModel):
    id: str
    name: str
    kind: str
    text: str


class PublicNotebook(BaseModel):
    title: str
    sources: list[PublicSource]
    notes: list[dict[str, object]]
    artifacts: list[dict[str, object]]


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/notebooks/{notebook_id}/shares", response_model=ShareCreated, status_code=201)
async def create_share(notebook_id: str, body: ShareCreate, user: User, db: Db) -> ShareCreated:
    await owned_notebook(db, user.id, notebook_id)
    token = secrets.token_urlsafe(32)
    expires_at = (
        datetime.now(UTC) + timedelta(hours=body.expires_in_hours)
        if body.expires_in_hours
        else None
    )
    share = NotebookShare(
        id=str(uuid4()),
        notebook_id=notebook_id,
        user_id=user.id,
        token_hash=_token_hash(token),
        expires_at=expires_at,
    )
    db.add(share)
    await db.commit()
    return ShareCreated(id=share.id, token=token, url_path=f"/share/{token}", expires_at=expires_at)


@router.delete("/notebooks/{notebook_id}/shares/{share_id}", status_code=204)
async def revoke_share(notebook_id: str, share_id: str, user: User, db: Db) -> None:
    await owned_notebook(db, user.id, notebook_id)
    share = (
        await db.scalars(
            select(NotebookShare).where(
                NotebookShare.id == share_id,
                NotebookShare.notebook_id == notebook_id,
                NotebookShare.user_id == user.id,
            )
        )
    ).one_or_none()
    if share is None:
        raise HTTPException(404, "Share link not found")
    share.revoked_at = datetime.now(UTC)
    await db.commit()


async def _active_share(token: str, db: AsyncSession) -> NotebookShare:
    share = (
        await db.scalars(
            select(NotebookShare).where(NotebookShare.token_hash == _token_hash(token))
        )
    ).one_or_none()
    now = datetime.now(UTC)
    expires_at = share.expires_at if share is not None else None
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if (
        share is None
        or share.revoked_at is not None
        or (expires_at and expires_at <= now)
    ):
        raise HTTPException(404, "Shared notebook is unavailable")
    return share


async def _rate_limit(request: Request, token_hash: str | None) -> None:
    host = request.client.host if request.client else "unknown"
    ip_hash = hashlib.sha256(host.encode()).hexdigest()
    redis = Redis.from_url(request.app.state.settings.redis_url)
    try:
        increment = (
            "local n=redis.call('INCR',KEYS[1]); "
            "if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n"
        )
        ip_count = await redis.eval(increment, 1, f"shared-ip:{ip_hash}")
        count = (
            await redis.eval(increment, 1, f"shared-read:{token_hash}:{ip_hash}")
            if token_hash
            else 0
        )
    finally:
        await redis.aclose()
    if int(ip_count) > 60 or int(count) > 30:
        raise HTTPException(
            429, "Shared notebook read limit exceeded", headers={"Retry-After": "60"}
        )


@router.get("/public/shares/{token}", response_model=PublicNotebook)
async def read_shared(token: str, request: Request, db: Db) -> PublicNotebook:
    if len(token) > 128:
        raise HTTPException(404, "Shared notebook is unavailable")
    await _rate_limit(request, None)
    share = await _active_share(token, db)
    await _rate_limit(request, share.token_hash)
    notebook = await db.get(Notebook, share.notebook_id)
    if notebook is None:
        raise HTTPException(404, "Shared notebook is unavailable")
    sources = list(
        (
            await db.scalars(
                select(Source)
                .where(Source.notebook_id == notebook.id, Source.status == "ready")
                .order_by(Source.created_at, Source.id)
            )
        ).all()
    )
    notes = list(
        (
            await db.scalars(
                select(Note).where(Note.notebook_id == notebook.id).order_by(Note.created_at)
            )
        ).all()
    )
    artifacts = list(
        (
            await db.scalars(
                select(Artifact)
                .where(Artifact.notebook_id == notebook.id, Artifact.status == "ready")
                .order_by(Artifact.created_at)
            )
        ).all()
    )
    return PublicNotebook(
        title=notebook.title,
        sources=[
            PublicSource(id=row.id, name=row.name, kind=row.kind, text=row.extracted_text or "")
            for row in sources
        ],
        notes=[
            {
                "title": row.title,
                "content_markdown": row.content_markdown,
                "citations": row.citations_json,
            }
            for row in notes
        ],
        artifacts=[
            {"recipe": row.recipe, "output": row.output_json, "citations": row.citations_json}
            for row in artifacts
        ],
    )


@router.get("/notebooks/{notebook_id}/export.zip")
async def export_notebook(notebook_id: str, user: User, db: Db) -> Response:
    notebook = await owned_notebook(db, user.id, notebook_id)
    notes = list(
        (
            await db.scalars(
                select(Note).where(Note.notebook_id == notebook_id).order_by(Note.created_at)
            )
        ).all()
    )
    sources = list(
        (
            await db.scalars(
                select(Source).where(Source.notebook_id == notebook_id).order_by(Source.created_at)
            )
        ).all()
    )
    artifacts = list(
        (
            await db.scalars(
                select(Artifact)
                .where(Artifact.notebook_id == notebook_id)
                .order_by(Artifact.created_at)
            )
        ).all()
    )
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "notebook.json",
            json.dumps(
                {
                    "id": notebook.id,
                    "title": notebook.title,
                    "created_at": notebook.created_at.isoformat(),
                },
                ensure_ascii=False,
                indent=2,
            ),
        )
        archive.writestr(
            "sources.json",
            json.dumps(
                [
                    {"name": s.name, "kind": s.kind, "url": s.url, "text": s.extracted_text}
                    for s in sources
                ],
                ensure_ascii=False,
                indent=2,
            ),
        )
        for note in notes:
            archive.writestr(f"notes/{note.id}.md", note.content_markdown)
            archive.writestr(
                f"notes/{note.id}.json",
                json.dumps(
                    {"title": note.title, "citations": note.citations_json},
                    ensure_ascii=False,
                    indent=2,
                ),
            )
        for artifact in artifacts:
            archive.writestr(
                f"artifacts/{artifact.id}.json",
                json.dumps(
                    {
                        "recipe": artifact.recipe,
                        "status": artifact.status,
                        "output": artifact.output_json,
                        "citations": artifact.citations_json,
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
            )
    return Response(
        output.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="notebook-{notebook.id}.zip"'},
    )
