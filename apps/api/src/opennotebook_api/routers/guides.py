"""Owned source guides and notebook overviews."""

from typing import Annotated

from fastapi import APIRouter, Depends
from opennotebook_core.models import NotebookOverview, SourceGuide
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from opennotebook_api.deps.auth import CurrentUser, get_current_user
from opennotebook_api.deps.db import get_db
from opennotebook_api.routers.notebooks import owned_notebook
from opennotebook_api.routers.sources import _owned_source

router = APIRouter(prefix="/notebooks/{notebook_id}", tags=["guides"])
User = Annotated[CurrentUser, Depends(get_current_user)]
Db = Annotated[AsyncSession, Depends(get_db)]


class GuideOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    status: str
    summary: str
    topics: list[str]
    questions: list[str]
    model_name: str
    error: str | None


@router.get("/sources/{source_id}/guide", response_model=GuideOut)
async def source_guide(notebook_id: str, source_id: str, user: User, db: Db) -> GuideOut:
    source = await _owned_source(db, notebook_id, user.id, source_id)
    guide = await db.get(SourceGuide, source.id)
    if guide is None:
        return GuideOut(
            status="pending" if source.status != "failed" else "failed",
            summary="",
            topics=[],
            questions=[],
            model_name="",
            error=source.error,
        )
    return GuideOut.model_validate(guide)


@router.get("/overview", response_model=GuideOut | None)
async def notebook_overview(notebook_id: str, user: User, db: Db) -> GuideOut | None:
    await owned_notebook(db, user.id, notebook_id)
    overview = await db.get(NotebookOverview, notebook_id)
    return (
        GuideOut.model_validate(overview)
        if overview is not None and overview.user_id == user.id
        else None
    )
