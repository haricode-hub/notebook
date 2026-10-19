"""Owned, job-backed Studio text artifacts."""

from collections.abc import AsyncIterator
from datetime import datetime
from typing import Annotated, Literal, cast
from uuid import uuid4

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response, StreamingResponse
from opennotebook_core.artifacts import (
    RECIPES_REGISTRY,
    ArtifactDocument,
    FlashcardsArtifact,
    MindMapArtifact,
    QuizArtifact,
    docx_export,
    markdown_export,
)
from opennotebook_core.models import Artifact, FlashcardProgress, Job, QuizAttempt, Source
from opennotebook_core.prompts.artifact_v2 import VERSION
from opennotebook_core.prompts.chat_v1 import Citation
from opennotebook_core.study import schedule_review, score_quiz
from pydantic import BaseModel, ConfigDict, Field
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from opennotebook_api.deps.auth import CurrentUser, get_current_user
from opennotebook_api.deps.db import get_db
from opennotebook_api.routers.chat import ChatCitation
from opennotebook_api.routers.notebooks import owned_notebook

router = APIRouter(prefix="/notebooks/{notebook_id}/artifacts", tags=["artifacts"])
User = Annotated[CurrentUser, Depends(get_current_user)]
Db = Annotated[AsyncSession, Depends(get_db)]


class ArtifactOptions(BaseModel):
    source_ids: list[str] = Field(default_factory=list, max_length=50)
    language: str = Field(default="English", min_length=2, max_length=50)
    length: Literal["short", "default", "long"] = "default"
    focus: str = Field(default="", max_length=2000)
    model_override: str = Field(default="", max_length=200)
    question_count: int = Field(default=10, ge=3, le=20)
    difficulty: Literal["easy", "medium", "hard"] = "medium"


class ArtifactCreate(ArtifactOptions):
    recipe: str


class RecipeOut(BaseModel):
    id: str
    title: str
    renderer_id: str


class ArtifactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    notebook_id: str
    recipe: str
    status: str
    stage: str
    progress: int
    source_ids: list[str]
    options: ArtifactOptions
    output: ArtifactDocument | MindMapArtifact | FlashcardsArtifact | QuizArtifact | None
    citations: list[ChatCitation]
    model_name: str | None
    prompt_version: str
    error: str | None
    created_at: datetime
    updated_at: datetime


def _out(record: Artifact) -> ArtifactOut:
    return ArtifactOut(
        id=record.id,
        notebook_id=record.notebook_id,
        recipe=record.recipe,
        status=record.status,
        stage=record.stage,
        progress=record.progress,
        source_ids=record.source_ids,
        options=ArtifactOptions.model_validate(
            {**record.options_json, "source_ids": record.source_ids}
        ),
        output=(
            cast(
                ArtifactDocument | MindMapArtifact | FlashcardsArtifact | QuizArtifact,
                RECIPES_REGISTRY[record.recipe].output_schema.model_validate(record.output_json),
            )
            if record.output_json
            else None
        ),
        citations=[ChatCitation.model_validate(item) for item in record.citations_json],
        model_name=record.model_name,
        prompt_version=record.prompt_version,
        error=record.error,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


async def _owned_artifact(
    db: AsyncSession, notebook_id: str, user_id: str, artifact_id: str
) -> Artifact:
    artifact = (
        await db.scalars(
            select(Artifact).where(
                Artifact.id == artifact_id,
                Artifact.notebook_id == notebook_id,
                Artifact.user_id == user_id,
            )
        )
    ).one_or_none()
    if artifact is None:
        raise HTTPException(404, "Artifact not found")
    return artifact


async def _enqueue(request: Request, db: AsyncSession, artifact: Artifact) -> None:
    job = Job(
        id=str(uuid4()),
        user_id=artifact.user_id,
        kind="generate_text_artifact",
        status="queued",
        stage="queued",
        progress=0,
    )
    db.add(job)
    await db.flush()
    artifact.job_id = job.id
    await db.commit()
    pool: ArqRedis | None = None
    try:
        pool = await create_pool(RedisSettings.from_dsn(request.app.state.settings.redis_url))
        await pool.enqueue_job("generate_text_artifact", artifact.id, _job_id=job.id)
    except Exception as exc:
        artifact.status = "failed"
        artifact.stage = "failed"
        artifact.error = "Generation queue is unavailable"
        job.status = "failed"
        job.error = artifact.error
        await db.commit()
        raise HTTPException(503, "Generation queue is unavailable") from exc
    finally:
        if pool is not None:
            await pool.aclose()


@router.get("/recipes", response_model=list[RecipeOut])
async def recipes(notebook_id: str, user: User, db: Db) -> list[RecipeOut]:
    await owned_notebook(db, user.id, notebook_id)
    return [
        RecipeOut(id=recipe.id, title=recipe.title, renderer_id=recipe.renderer_id)
        for recipe in RECIPES_REGISTRY.values()
    ]


@router.get("", response_model=list[ArtifactOut])
async def list_artifacts(notebook_id: str, user: User, db: Db) -> list[ArtifactOut]:
    await owned_notebook(db, user.id, notebook_id)
    records = (
        await db.scalars(
            select(Artifact)
            .where(Artifact.notebook_id == notebook_id, Artifact.user_id == user.id)
            .order_by(Artifact.created_at.desc(), Artifact.id.desc())
        )
    ).all()
    return [_out(record) for record in records]


@router.post("", response_model=ArtifactOut, status_code=status.HTTP_202_ACCEPTED)
async def create_artifact(
    notebook_id: str, body: ArtifactCreate, request: Request, user: User, db: Db
) -> ArtifactOut:
    await owned_notebook(db, user.id, notebook_id)
    if body.recipe not in RECIPES_REGISTRY:
        raise HTTPException(422, "Unknown artifact recipe")
    sources = list(
        (
            await db.scalars(
                select(Source).where(
                    Source.notebook_id == notebook_id,
                    Source.user_id == user.id,
                    Source.selected.is_(True),
                    Source.status == "ready",
                )
            )
        ).all()
    )
    available = {source.id for source in sources}
    selected = list(dict.fromkeys(body.source_ids)) if body.source_ids else sorted(available)
    if not selected or not set(selected) <= available:
        raise HTTPException(422, "Select one or more ready, selected sources")
    artifact = Artifact(
        id=str(uuid4()),
        notebook_id=notebook_id,
        user_id=user.id,
        recipe=body.recipe,
        source_ids=selected,
        options_json=body.model_dump(exclude={"source_ids", "recipe"}),
        status="queued",
        stage="queued",
        progress=0,
        prompt_version=VERSION,
    )
    db.add(artifact)
    await db.flush()
    await _enqueue(request, db, artifact)
    await db.refresh(artifact)
    return _out(artifact)


@router.get("/events")
async def artifact_events(
    notebook_id: str, request: Request, user: User, db: Db
) -> StreamingResponse:
    await owned_notebook(db, user.id, notebook_id)
    redis = Redis.from_url(request.app.state.settings.redis_url)

    async def events() -> AsyncIterator[str]:
        try:
            async with redis.pubsub() as pubsub:
                await pubsub.subscribe(f"notebook:{notebook_id}:artifact-events")
                yield ": connected\n\n"
                for _ in range(25):
                    if await request.is_disconnected():
                        break
                    message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1)
                    yield f"data: {message['data'].decode()}\n\n" if message else ": heartbeat\n\n"
        finally:
            await redis.aclose()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/{artifact_id}", response_model=ArtifactOut)
async def get_artifact(notebook_id: str, artifact_id: str, user: User, db: Db) -> ArtifactOut:
    return _out(await _owned_artifact(db, notebook_id, user.id, artifact_id))


@router.post("/{artifact_id}/regenerate", response_model=ArtifactOut, status_code=202)
async def regenerate_artifact(
    notebook_id: str, artifact_id: str, request: Request, user: User, db: Db
) -> ArtifactOut:
    artifact = await _owned_artifact(db, notebook_id, user.id, artifact_id)
    if artifact.status not in {"ready", "failed"}:
        raise HTTPException(409, "Artifact is already generating")
    artifact.status = "queued"
    artifact.stage = "queued"
    artifact.progress = 0
    artifact.error = None
    await _enqueue(request, db, artifact)
    await db.refresh(artifact)
    return _out(artifact)


@router.delete("/{artifact_id}", status_code=204)
async def delete_artifact(notebook_id: str, artifact_id: str, user: User, db: Db) -> None:
    artifact = await _owned_artifact(db, notebook_id, user.id, artifact_id)
    if artifact.status not in {"ready", "failed"}:
        raise HTTPException(409, "Wait for generation to finish before deleting")
    await db.delete(artifact)
    await db.commit()


@router.get("/{artifact_id}/export/{format}")
async def export_artifact(
    notebook_id: str, artifact_id: str, format: Literal["md", "docx"], user: User, db: Db
) -> Response:
    artifact = await _owned_artifact(db, notebook_id, user.id, artifact_id)
    if artifact.status != "ready" or artifact.output_json is None:
        raise HTTPException(409, "Artifact is not ready")
    if artifact.recipe in {"mindmap", "flashcards", "quiz"}:
        raise HTTPException(409, "Use the interactive viewer export for this artifact")
    document = ArtifactDocument.model_validate(artifact.output_json)
    citations = cast(
        list[Citation],
        [ChatCitation.model_validate(item).model_dump() for item in artifact.citations_json],
    )
    if format == "md":
        data = markdown_export(document, citations).encode()
        media_type = "text/markdown; charset=utf-8"
    else:
        data = docx_export(document, citations)
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    filename = f"{artifact.recipe}-{artifact.id[:8]}.{format}"
    return Response(
        data,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "private, no-store",
        },
    )


class FlashcardReviewIn(BaseModel):
    known: bool


class FlashcardProgressOut(BaseModel):
    card_index: int
    box: int
    due_at: datetime
    last_result: str | None


class QuizAttemptIn(BaseModel):
    model_config = ConfigDict(strict=True)
    answers: list[int] = Field(min_length=1, max_length=50)


class QuizAttemptOut(BaseModel):
    id: str
    score: int
    total: int
    answers: list[int]
    wrong_indices: list[int]
    created_at: datetime


@router.get("/{artifact_id}/flashcards/progress", response_model=list[FlashcardProgressOut])
async def flashcard_progress(
    notebook_id: str, artifact_id: str, user: User, db: Db
) -> list[FlashcardProgressOut]:
    artifact = await _owned_artifact(db, notebook_id, user.id, artifact_id)
    if artifact.recipe != "flashcards" or artifact.status != "ready":
        raise HTTPException(409, "Flashcards are not ready")
    rows = (
        await db.scalars(
            select(FlashcardProgress).where(
                FlashcardProgress.artifact_id == artifact_id,
                FlashcardProgress.user_id == user.id,
            )
        )
    ).all()
    return [FlashcardProgressOut.model_validate(row, from_attributes=True) for row in rows]


@router.post("/{artifact_id}/flashcards/{card_index}/review", response_model=FlashcardProgressOut)
async def review_flashcard(
    notebook_id: str,
    artifact_id: str,
    card_index: int,
    body: FlashcardReviewIn,
    user: User,
    db: Db,
) -> FlashcardProgressOut:
    artifact = await _owned_artifact(db, notebook_id, user.id, artifact_id)
    if artifact.recipe != "flashcards" or artifact.status != "ready":
        raise HTTPException(409, "Flashcards are not ready")
    document = FlashcardsArtifact.model_validate(artifact.output_json)
    if not 0 <= card_index < len(document.cards):
        raise HTTPException(404, "Flashcard not found")
    row = (
        await db.scalars(
            select(FlashcardProgress).where(
                FlashcardProgress.artifact_id == artifact_id,
                FlashcardProgress.user_id == user.id,
                FlashcardProgress.card_index == card_index,
            )
        )
    ).one_or_none()
    box, due_at = schedule_review(row.box if row else 1, body.known)
    if row is None:
        row = FlashcardProgress(
            artifact_id=artifact_id,
            user_id=user.id,
            card_index=card_index,
            box=box,
            due_at=due_at,
            last_result="known" if body.known else "unknown",
        )
        db.add(row)
    else:
        row.box, row.due_at = box, due_at
        row.last_result = "known" if body.known else "unknown"
    await db.commit()
    await db.refresh(row)
    return FlashcardProgressOut.model_validate(row, from_attributes=True)


@router.get("/{artifact_id}/quiz/attempts", response_model=list[QuizAttemptOut])
async def list_quiz_attempts(
    notebook_id: str, artifact_id: str, user: User, db: Db
) -> list[QuizAttemptOut]:
    artifact = await _owned_artifact(db, notebook_id, user.id, artifact_id)
    if artifact.recipe != "quiz":
        raise HTTPException(409, "Artifact is not a quiz")
    rows = (
        await db.scalars(
            select(QuizAttempt)
            .where(QuizAttempt.artifact_id == artifact_id, QuizAttempt.user_id == user.id)
            .order_by(QuizAttempt.created_at.desc())
        )
    ).all()
    return [
        QuizAttemptOut(
            id=row.id,
            score=row.score,
            total=row.total,
            answers=row.answers_json,
            wrong_indices=row.wrong_indices,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post("/{artifact_id}/quiz/attempts", response_model=QuizAttemptOut, status_code=201)
async def create_quiz_attempt(
    notebook_id: str, artifact_id: str, body: QuizAttemptIn, user: User, db: Db
) -> QuizAttemptOut:
    artifact = await _owned_artifact(db, notebook_id, user.id, artifact_id)
    if artifact.recipe != "quiz" or artifact.status != "ready":
        raise HTTPException(409, "Quiz is not ready")
    quiz = QuizArtifact.model_validate(artifact.output_json)
    if len(body.answers) != len(quiz.questions) or any(
        answer not in range(4) for answer in body.answers
    ):
        raise HTTPException(422, "Provide one valid option index per question")
    score, wrong = score_quiz([item.answer_index for item in quiz.questions], body.answers)
    row = QuizAttempt(
        artifact_id=artifact_id,
        user_id=user.id,
        score=score,
        total=len(quiz.questions),
        answers_json=body.answers,
        wrong_indices=wrong,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return QuizAttemptOut(
        id=row.id,
        score=row.score,
        total=row.total,
        answers=row.answers_json,
        wrong_indices=row.wrong_indices,
        created_at=row.created_at,
    )
