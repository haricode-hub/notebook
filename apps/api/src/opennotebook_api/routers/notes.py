"""Owned notes, canonical chat capture, and conversion back into sources."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from opennotebook_core.models import ChatMessage, Note, Source
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from opennotebook_api.deps.auth import CurrentUser, get_current_user
from opennotebook_api.deps.db import get_db
from opennotebook_api.routers.chat import ChatCitation
from opennotebook_api.routers.notebooks import owned_notebook
from opennotebook_api.routers.sources import SourceOut, TextSourceIn, add_text

router = APIRouter(prefix="/notebooks/{notebook_id}/notes", tags=["notes"])
User = Annotated[CurrentUser, Depends(get_current_user)]
Db = Annotated[AsyncSession, Depends(get_db)]


class NoteIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content_markdown: str = Field(default="", max_length=5_000_000)
    pinned: bool = False


class NotePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content_markdown: str | None = Field(default=None, max_length=5_000_000)
    pinned: bool | None = None


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    notebook_id: str
    title: str
    content_markdown: str
    citations: list[ChatCitation]
    pinned: bool
    converted_source_id: str | None
    created_at: datetime
    updated_at: datetime


def _out(note: Note) -> NoteOut:
    return NoteOut(
        id=note.id,
        notebook_id=note.notebook_id,
        title=note.title,
        content_markdown=note.content_markdown,
        citations=[ChatCitation.model_validate(citation) for citation in note.citations_json],
        pinned=note.pinned,
        converted_source_id=note.converted_source_id,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


async def _owned_note(db: AsyncSession, notebook_id: str, user_id: str, note_id: str) -> Note:
    note = (
        await db.scalars(
            select(Note).where(
                Note.id == note_id, Note.notebook_id == notebook_id, Note.user_id == user_id
            )
        )
    ).one_or_none()
    if note is None:
        raise HTTPException(404, "Note not found")
    return note


@router.get("", response_model=list[NoteOut])
async def list_notes(notebook_id: str, user: User, db: Db) -> list[NoteOut]:
    await owned_notebook(db, user.id, notebook_id)
    notes = (
        await db.scalars(
            select(Note)
            .where(Note.notebook_id == notebook_id, Note.user_id == user.id)
            .order_by(Note.pinned.desc(), Note.updated_at.desc(), Note.id)
        )
    ).all()
    return [_out(note) for note in notes]


@router.post("", status_code=status.HTTP_201_CREATED, response_model=NoteOut)
async def create_note(notebook_id: str, body: NoteIn, user: User, db: Db) -> NoteOut:
    await owned_notebook(db, user.id, notebook_id)
    if not body.title.strip():
        raise HTTPException(422, "Note title cannot be blank")
    note = Note(
        notebook_id=notebook_id,
        user_id=user.id,
        title=body.title.strip(),
        content_markdown=body.content_markdown,
        pinned=body.pinned,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return _out(note)


@router.post("/from-chat/{message_id}", status_code=status.HTTP_201_CREATED, response_model=NoteOut)
async def save_chat_note(notebook_id: str, message_id: str, user: User, db: Db) -> NoteOut:
    await owned_notebook(db, user.id, notebook_id)
    message = (
        await db.scalars(
            select(ChatMessage).where(
                ChatMessage.id == message_id,
                ChatMessage.notebook_id == notebook_id,
                ChatMessage.user_id == user.id,
                ChatMessage.role == "assistant",
            )
        )
    ).one_or_none()
    if message is None:
        raise HTTPException(404, "Answer not found")
    title = message.content.splitlines()[0].removeprefix("# ").strip()[:200] or "Saved answer"
    note = Note(
        notebook_id=notebook_id,
        user_id=user.id,
        title=title,
        content_markdown=message.content,
        citations_json=message.citations_json,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return _out(note)


@router.get("/{note_id}", response_model=NoteOut)
async def get_note(notebook_id: str, note_id: str, user: User, db: Db) -> NoteOut:
    return _out(await _owned_note(db, notebook_id, user.id, note_id))


@router.patch("/{note_id}", response_model=NoteOut)
async def patch_note(
    notebook_id: str, note_id: str, body: NotePatch, user: User, db: Db
) -> NoteOut:
    note = await _owned_note(db, notebook_id, user.id, note_id)
    if body.title is not None:
        if not body.title.strip():
            raise HTTPException(422, "Note title cannot be blank")
        note.title = body.title.strip()
    if body.content_markdown is not None:
        note.content_markdown = body.content_markdown
    if body.pinned is not None:
        note.pinned = body.pinned
    await db.commit()
    await db.refresh(note)
    return _out(note)


@router.delete("/{note_id}", status_code=204)
async def delete_note(notebook_id: str, note_id: str, user: User, db: Db) -> None:
    note = await _owned_note(db, notebook_id, user.id, note_id)
    await db.delete(note)
    await db.commit()


@router.post("/{note_id}/convert-to-source", response_model=SourceOut, status_code=201)
async def convert_note(
    notebook_id: str, note_id: str, request: Request, user: User, db: Db
) -> Source:
    note = await _owned_note(db, notebook_id, user.id, note_id)
    if note.converted_source_id:
        source = await db.get(Source, note.converted_source_id)
        if source is not None and source.user_id == user.id:
            return source
    if not note.content_markdown.strip():
        raise HTTPException(422, "Add content before converting this note")
    source = await add_text(
        notebook_id, TextSourceIn(name=note.title, text=note.content_markdown), request, user, db
    )
    note.converted_source_id = source.id
    await db.commit()
    return source
