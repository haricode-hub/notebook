"""Owned, source-grounded chat over an authenticated SSE response."""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from opennotebook_core.models import ChatMessage, Source
from opennotebook_core.prompts.chat_v1 import (
    build_chat_messages,
    suggested_questions,
    validate_citations,
)
from opennotebook_core.retrieval import REFUSAL, condense_query, select_context
from pydantic import BaseModel, Field
from redis.asyncio import Redis
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from opennotebook_api.deps.auth import CurrentUser, get_current_user
from opennotebook_api.deps.db import get_db
from opennotebook_api.routers.notebooks import owned_notebook
from opennotebook_api.routers.settings import effective_key, settings_response, settings_row

router = APIRouter(prefix="/notebooks/{notebook_id}/chat", tags=["chat"])
User = Annotated[CurrentUser, Depends(get_current_user)]
Db = Annotated[AsyncSession, Depends(get_db)]
logger = logging.getLogger("opennotebook.api.chat")


class ChatIn(BaseModel):
    question: str = Field(min_length=1, max_length=4000)


class ChatCitation(BaseModel):
    n: int
    chunk_id: str | None
    source_id: str
    page_start: int | None
    time_start: float | None = None
    time_end: float | None = None
    char_start: int
    char_end: int
    source_name: str
    quote: str
    media_item_id: str | None = None


class ChatMessageOut(BaseModel):
    id: str
    role: str
    content: str
    citations: list[ChatCitation]
    model_name: str | None
    created_at: datetime


class ChatFinal(BaseModel):
    message_id: str
    content: str
    citations: list[ChatCitation]
    followups: list[str]
    model_name: str


class RedisChatLimiter:
    def __init__(self, redis_url: str, limit: int) -> None:
        self.redis_url = redis_url
        self.limit = limit

    async def allow(self, user_id: str) -> bool:
        redis = Redis.from_url(self.redis_url)
        try:
            key = f"chat-rate:{user_id}"
            async with redis.pipeline(transaction=True) as pipe:
                pipe.incr(key)
                pipe.expire(key, 60, nx=True)
                count, _ = await pipe.execute()
            return int(count) <= self.limit
        finally:
            await redis.aclose()


def _frame(event: str, payload: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _message_out(row: ChatMessage) -> ChatMessageOut:
    return ChatMessageOut(
        id=row.id,
        role=row.role,
        content=row.content,
        citations=[ChatCitation.model_validate(citation) for citation in row.citations_json],
        model_name=row.model_name,
        created_at=row.created_at,
    )


@router.get("", response_model=list[ChatMessageOut])
async def chat_history(notebook_id: str, user: User, db: Db) -> list[ChatMessageOut]:
    await owned_notebook(db, user.id, notebook_id)
    rows = list(
        (
            await db.scalars(
                select(ChatMessage)
                .where(ChatMessage.notebook_id == notebook_id, ChatMessage.user_id == user.id)
                .order_by(ChatMessage.created_at, ChatMessage.id)
            )
        ).all()
    )
    return [_message_out(row) for row in rows]


@router.delete("", status_code=204)
async def clear_chat(notebook_id: str, user: User, db: Db) -> None:
    await owned_notebook(db, user.id, notebook_id)
    await db.execute(
        delete(ChatMessage).where(
            ChatMessage.notebook_id == notebook_id, ChatMessage.user_id == user.id
        )
    )
    await db.commit()


@router.post("", response_class=StreamingResponse)
async def chat_stream(
    notebook_id: str, body: ChatIn, request: Request, user: User, db: Db
) -> StreamingResponse:
    notebook = await owned_notebook(db, user.id, notebook_id)
    config = request.app.state.settings
    if not await request.app.state.chat_limiter.allow(user.id):
        raise HTTPException(
            status_code=429, detail="Chat rate limit reached. Try again in a minute"
        )
    selected_ids = list(
        (
            await db.scalars(
                select(Source.id).where(
                    Source.notebook_id == notebook_id,
                    Source.user_id == user.id,
                    Source.selected.is_(True),
                    Source.status == "ready",
                )
            )
        ).all()
    )
    previous = list(
        (
            await db.scalars(
                select(ChatMessage)
                .where(ChatMessage.notebook_id == notebook_id, ChatMessage.user_id == user.id)
                .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
                .limit(config.chat_max_history)
            )
        ).all()
    )
    history = [{"role": row.role, "content": row.content[:4000]} for row in reversed(previous)]
    settings = await settings_row(db, user.id)
    view = settings_response(settings, config)
    if config.llm_provider == "fake":
        provider, model, key = "fake", "fake", ""
    else:
        provider, model = view.provider, view.chat_model
        key = effective_key(provider, settings, config)
    if selected_ids and (not model or (provider not in {"fake", "ollama"} and not key)):
        raise HTTPException(400, "Select a chat model and configure its API key in Settings")
    selected_config = config.model_copy(
        update={
            "llm_provider": provider,
            "default_chat_model": model,
            "fallback_model": view.fallback_model,
            f"{provider}_api_key": key,
            "ollama_base_url": view.ollama_base_url,
        }
    )
    cheap_llm = None
    if selected_ids and history and provider != "fake":
        cheap_config = selected_config.model_copy(
            update={"default_chat_model": view.cheap_model or model}
        )
        cheap_llm = request.app.state.llm_factory(cheap_config)
    condensed = await condense_query(body.question, history, cheap_llm)
    window = (
        request.app.state.model_catalog.context_length(model) if provider == "openrouter" else None
    ) or config.chat_context_tokens
    selection = await select_context(
        db,
        request.app.state.embedding_factory(config),
        notebook_id,
        selected_ids,
        condensed,
        dim=config.embed_dim,
        context_window=window,
        multimodal_enabled=config.multimodal_enabled and config.multimodal_image_enabled,
    )
    prompt = build_chat_messages(
        selection,
        body.question,
        history,
        persona=notebook.persona,
        response_length=notebook.response_length,
    )
    user_message = ChatMessage(
        notebook_id=notebook_id,
        user_id=user.id,
        role="user",
        content=body.question,
        citations_json=[],
        created_at=datetime.now(UTC),
    )
    db.add(user_message)
    await db.commit()

    async def events() -> AsyncIterator[str]:
        parts: list[str] = []
        stream: AsyncIterator[str] | None = None
        try:
            if selection.chunks or selection.media_items:
                stream = request.app.state.llm_factory(selected_config).stream(prompt)
                async for token in stream:
                    parts.append(token)
                    yield _frame("token", {"text": token})
            else:
                parts.append(REFUSAL)
                yield _frame("token", {"text": REFUSAL})
            answer, citations = validate_citations("".join(parts), selection)
            if not selection.chunks and not selection.media_items:
                answer, citations = REFUSAL, []
            async with request.app.state.session_factory() as session:
                assistant = ChatMessage(
                    notebook_id=notebook_id,
                    user_id=user.id,
                    role="assistant",
                    content=answer,
                    citations_json=[dict(citation) for citation in citations],
                    model_name=model or "none",
                    created_at=datetime.now(UTC),
                )
                session.add(assistant)
                await session.commit()
            final = ChatFinal(
                message_id=assistant.id,
                content=answer,
                citations=[ChatCitation.model_validate(citation) for citation in citations],
                followups=suggested_questions(selection) if citations else [],
                model_name=model or "none",
            )
            yield _frame("final", final.model_dump())
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("chat_stream_failed notebook_id=%s", notebook_id)
            yield _frame("error", {"message": "Chat failed. Please try again."})
        finally:
            if stream is not None:
                close = getattr(stream, "aclose", None)
                if close is not None:
                    await close()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
