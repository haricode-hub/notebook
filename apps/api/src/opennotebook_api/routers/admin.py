"""Role-protected operational summaries for failed jobs and chat usage."""

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from opennotebook_core.models import Job, LLMUsage
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from opennotebook_api.deps.auth import CurrentUser, get_current_user
from opennotebook_api.deps.db import get_db

router = APIRouter(prefix="/admin", tags=["admin"])
User = Annotated[CurrentUser, Depends(get_current_user)]
Db = Annotated[AsyncSession, Depends(get_db)]


class AdminJob(BaseModel):
    id: str
    user_id: str
    kind: str
    status: str
    stage: str | None
    progress: int
    error: str | None


class UserUsage(BaseModel):
    user_id: str
    requests: int
    input_tokens: int
    output_tokens: int
    reported_cost_usd: float | None


class AdminOverview(BaseModel):
    generated_at: datetime
    failed_jobs: list[AdminJob]
    usage_24h: list[UserUsage]


@router.get("/overview", response_model=AdminOverview)
async def overview(user: User, db: Db) -> AdminOverview:
    if user.role != "admin":
        raise HTTPException(403, "Administrator access required")
    jobs = list(
        (
            await db.scalars(
                select(Job)
                .where(Job.status == "failed")
                .order_by(Job.updated_at.desc())
                .limit(100)
            )
        ).all()
    )
    since = datetime.now(UTC) - timedelta(hours=24)
    rows = (
        await db.execute(
            select(
                LLMUsage.user_id,
                func.count(LLMUsage.id),
                func.sum(LLMUsage.input_tokens),
                func.sum(LLMUsage.output_tokens),
                func.sum(LLMUsage.cost_usd),
            )
            .where(LLMUsage.created_at >= since)
            .group_by(LLMUsage.user_id)
            .order_by(func.sum(LLMUsage.input_tokens + LLMUsage.output_tokens).desc())
            .limit(100)
        )
    ).all()
    return AdminOverview(
        generated_at=datetime.now(UTC),
        failed_jobs=[
            AdminJob(
                id=job.id,
                user_id=job.user_id,
                kind=job.kind,
                status=job.status,
                stage=job.stage,
                progress=job.progress,
                error=job.error,
            )
            for job in jobs
        ],
        usage_24h=[
            UserUsage(
                user_id=row[0],
                requests=int(row[1] or 0),
                input_tokens=int(row[2] or 0),
                output_tokens=int(row[3] or 0),
                reported_cost_usd=float(row[4]) if row[4] is not None else None,
            )
            for row in rows
        ],
    )
