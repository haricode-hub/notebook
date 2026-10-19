"""Self-service account export and private Better Auth integration hooks."""

import asyncio
import io
import json
import secrets
import smtplib
import ssl
import zipfile
from email.message import EmailMessage
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from opennotebook_core.config import Settings
from opennotebook_core.models import (
    Artifact,
    Job,
    LLMUsage,
    MediaItem,
    Note,
    Notebook,
    Source,
    SummaryCache,
    UserSettings,
)
from opennotebook_core.storage import make_storage
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from opennotebook_api.deps.auth import CurrentUser, get_current_user, unauthorized
from opennotebook_api.deps.db import get_db

router = APIRouter(tags=["account"])
User = Annotated[CurrentUser, Depends(get_current_user)]
Db = Annotated[AsyncSession, Depends(get_db)]
internal_bearer = HTTPBearer(auto_error=False)


class InternalEmail(BaseModel):
    to: str = Field(min_length=3, max_length=320)
    subject: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1, max_length=20_000)
    html: str | None = Field(default=None, max_length=40_000)

    @field_validator("to")
    @classmethod
    def valid_email_shape(cls, value: str) -> str:
        if value.count("@") != 1 or any(char.isspace() for char in value):
            raise ValueError("valid recipient is required")
        local, domain = value.rsplit("@", 1)
        if not local or "." not in domain or domain.startswith(".") or domain.endswith("."):
            raise ValueError("valid recipient is required")
        return value


async def require_internal(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(internal_bearer)],
) -> bool:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized()
    configured = request.app.state.settings.account_internal_token
    if not configured:
        raise HTTPException(503, "Internal account service is not configured")
    if not secrets.compare_digest(credentials.credentials, configured):
        raise unauthorized()
    return True


Internal = Annotated[bool, Depends(require_internal)]


def _send_smtp(settings: Settings, message: EmailMessage) -> None:
    host = settings.smtp_host
    port = settings.smtp_port
    user = settings.smtp_user
    password = settings.smtp_password
    starttls = settings.smtp_starttls
    if not host:
        raise RuntimeError("Email delivery is not configured")
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=10, context=ssl.create_default_context()) as smtp:
            if user:
                smtp.login(user, password)
            smtp.send_message(message)
        return
    with smtplib.SMTP(host, port, timeout=10) as smtp:
        if starttls:
            smtp.starttls(context=ssl.create_default_context())
        if user:
            smtp.login(user, password)
        smtp.send_message(message)


@router.post("/internal/email", status_code=202, include_in_schema=True)
async def send_account_email(
    body: InternalEmail, request: Request, _internal: Internal
) -> dict[str, str]:
    settings = request.app.state.settings
    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = body.to
    message["Subject"] = body.subject
    message.set_content(body.text)
    if body.html:
        message.add_alternative(body.html, subtype="html")
    try:
        await asyncio.wait_for(asyncio.to_thread(_send_smtp, settings, message), timeout=12)
    except (OSError, RuntimeError, smtplib.SMTPException, TimeoutError) as exc:
        # Do not include the address, message body, or SMTP response in API logs/errors.
        raise HTTPException(503, "Email delivery is temporarily unavailable") from exc
    return {"status": "accepted"}


@router.delete("/internal/accounts/{user_id}/data", status_code=204)
async def purge_account_data(user_id: str, request: Request, _internal: Internal, db: Db) -> None:
    # Include soft-deleted notebooks too: their source and figure files still need
    # removal before the rows are hard-deleted during account cleanup.
    notebooks = list(
        (await db.scalars(select(Notebook).where(Notebook.user_id == user_id))).all()
    )
    notebook_ids = [notebook.id for notebook in notebooks]
    sources = list((await db.scalars(select(Source).where(Source.user_id == user_id))).all())
    media = (
        list(
            (
                await db.scalars(select(MediaItem).where(MediaItem.notebook_id.in_(notebook_ids)))
            ).all()
        )
        if notebook_ids
        else []
    )
    artifacts = list((await db.scalars(select(Artifact).where(Artifact.user_id == user_id))).all())
    storage_keys = {source.storage_key for source in sources if source.storage_key}
    storage_keys.update(item.storage_key for item in media)
    for artifact in artifacts:
        key = artifact.output_json.get("storage_key") if artifact.output_json else None
        if isinstance(key, str) and key:
            storage_keys.add(key)

    storage = make_storage(request.app.state.settings)
    try:
        for key in storage_keys:
            await storage.delete(key)
    except (OSError, ValueError) as exc:
        raise HTTPException(503, "Account data cleanup is temporarily unavailable") from exc

    # Notebook-owned rows (sources, vectors, chats, guides, notes, artifacts, attempts,
    # shares and overviews) cascade through PostgreSQL foreign keys. These tables have
    # no auth-user FK and must be removed explicitly.
    await db.execute(delete(Notebook).where(Notebook.user_id == user_id))
    await db.execute(delete(Job).where(Job.user_id == user_id))
    await db.execute(delete(LLMUsage).where(LLMUsage.user_id == user_id))
    await db.execute(delete(UserSettings).where(UserSettings.user_id == user_id))
    await db.execute(delete(SummaryCache).where(SummaryCache.user_id == user_id))
    await db.commit()


@router.get("/account/export.zip")
async def export_account(user: User, db: Db) -> Response:
    notebooks = list(
        (
            await db.scalars(
                select(Notebook)
                .where(Notebook.user_id == user.id, Notebook.deleted_at.is_(None))
                .order_by(Notebook.created_at)
            )
        ).all()
    )
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "account.json",
            json.dumps({"user_id": user.id, "notebook_count": len(notebooks)}, indent=2),
        )
        for notebook in notebooks:
            prefix = f"notebooks/{notebook.id}"
            archive.writestr(
                f"{prefix}/notebook.json",
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
            sources = list(
                (
                    await db.scalars(
                        select(Source)
                        .where(Source.notebook_id == notebook.id)
                        .order_by(Source.created_at)
                    )
                ).all()
            )
            notes = list(
                (
                    await db.scalars(
                        select(Note)
                        .where(Note.notebook_id == notebook.id)
                        .order_by(Note.created_at)
                    )
                ).all()
            )
            artifacts = list(
                (
                    await db.scalars(
                        select(Artifact)
                        .where(Artifact.notebook_id == notebook.id)
                        .order_by(Artifact.created_at)
                    )
                ).all()
            )
            archive.writestr(
                f"{prefix}/sources.json",
                json.dumps(
                    [
                        {
                            "id": row.id,
                            "name": row.name,
                            "kind": row.kind,
                            "url": row.url,
                            "text": row.extracted_text,
                        }
                        for row in sources
                    ],
                    ensure_ascii=False,
                    indent=2,
                ),
            )
            for note in notes:
                archive.writestr(f"{prefix}/notes/{note.id}.md", note.content_markdown)
                archive.writestr(
                    f"{prefix}/notes/{note.id}.json",
                    json.dumps(
                        {"title": note.title, "citations": note.citations_json},
                        ensure_ascii=False,
                        indent=2,
                    ),
                )
            for artifact in artifacts:
                archive.writestr(
                    f"{prefix}/artifacts/{artifact.id}.json",
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
        headers={"Content-Disposition": 'attachment; filename="opennotebook-account-export.zip"'},
    )
