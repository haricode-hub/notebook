from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from opennotebook_core.models import Notebook
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from opennotebook_api.deps.auth import CurrentUser, get_current_user
from opennotebook_api.deps.db import get_db

router = APIRouter(prefix="/notebooks", tags=["notebooks"])
User = Annotated[CurrentUser, Depends(get_current_user)]
Db = Annotated[AsyncSession, Depends(get_db)]


class NotebookCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    persona: str | None = Field(default=None, max_length=4000)
    response_length: Literal["short", "medium", "long"] = "medium"


class NotebookUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    persona: str | None = Field(default=None, max_length=4000)
    response_length: Literal["short", "medium", "long"] | None = None


class NotebookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    persona: str | None
    response_length: str
    created_at: datetime
    updated_at: datetime


async def owned_notebook(db: AsyncSession, user_id: str, notebook_id: str) -> Notebook:
    result = await db.execute(
        select(Notebook).where(Notebook.id == notebook_id, Notebook.user_id == user_id)
    )
    notebook = result.scalar_one_or_none()
    if notebook is None:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return notebook


@router.get("", response_model=list[NotebookOut])
async def list_notebooks(user: User, db: Db) -> list[Notebook]:
    result = await db.execute(
        select(Notebook)
        .where(Notebook.user_id == user.id)
        .order_by(Notebook.created_at.desc(), Notebook.id.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=NotebookOut, status_code=status.HTTP_201_CREATED)
async def create_notebook(body: NotebookCreate, user: User, db: Db) -> Notebook:
    notebook = Notebook(user_id=user.id, **body.model_dump())
    db.add(notebook)
    await db.commit()
    await db.refresh(notebook)
    return notebook


@router.get("/{notebook_id}", response_model=NotebookOut)
async def get_notebook(notebook_id: str, user: User, db: Db) -> Notebook:
    return await owned_notebook(db, user.id, notebook_id)


@router.patch("/{notebook_id}", response_model=NotebookOut)
async def update_notebook(
    notebook_id: str, body: NotebookUpdate, user: User, db: Db
) -> Notebook:
    notebook = await owned_notebook(db, user.id, notebook_id)
    if ("title" in body.model_fields_set and body.title is None) or (
        "response_length" in body.model_fields_set and body.response_length is None
    ):
        raise HTTPException(status_code=422, detail="Title and response length cannot be null")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(notebook, field, value)
    await db.commit()
    await db.refresh(notebook)
    return notebook


@router.delete("/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notebook(notebook_id: str, user: User, db: Db) -> None:
    notebook = await owned_notebook(db, user.id, notebook_id)
    await db.delete(notebook)
    await db.commit()
