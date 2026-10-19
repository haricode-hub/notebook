from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from cryptography.fernet import Fernet
from opennotebook_api.main import create_app
from opennotebook_core.config import Settings
from opennotebook_core.models import Base, Notebook, Source
from opennotebook_core.storage import MemoryStorage
from opennotebook_worker.main import cleanup_deleted_notebooks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from test_level1 import Keys, auth


@pytest.fixture
async def level14_app() -> Any:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    app = create_app(Settings(settings_encryption_key=Fernet.generate_key().decode()), {})
    app.state.session_factory = async_sessionmaker(engine, expire_on_commit=False)
    keys = Keys()
    keys.add("first")

    async def download() -> dict[str, Any]:
        return keys.jwks()

    app.state.jwks_verifier._download = download
    yield app, keys, engine
    await engine.dispose()


def test_notebook_delete_is_owned_recoverable_and_hidden(level14_app: Any) -> None:
    from fastapi.testclient import TestClient

    app, keys, _ = level14_app
    client = TestClient(app)
    owner = auth(keys.token("user-a"))
    other = auth(keys.token("user-b"))
    notebook = client.post("/notebooks", headers=owner, json={"title": "Undo me"}).json()
    notebook_id = notebook["id"]

    assert client.delete(f"/notebooks/{notebook_id}", headers=owner).status_code == 204
    assert client.get(f"/notebooks/{notebook_id}", headers=owner).status_code == 404
    assert client.get("/notebooks", headers=owner).json() == []
    assert client.post(f"/notebooks/{notebook_id}/restore", headers=other).status_code == 404

    restored = client.post(f"/notebooks/{notebook_id}/restore", headers=owner)
    assert restored.status_code == 200
    assert restored.json()["title"] == "Undo me"
    assert client.get(f"/notebooks/{notebook_id}", headers=owner).status_code == 200


def test_restore_rejects_expired_undo_window(level14_app: Any) -> None:
    import asyncio

    from fastapi.testclient import TestClient

    app, keys, engine = level14_app
    client = TestClient(app)
    owner = auth(keys.token("user-a"))
    notebook_id = client.post("/notebooks", headers=owner, json={"title": "Expired"}).json()["id"]
    assert client.delete(f"/notebooks/{notebook_id}", headers=owner).status_code == 204

    async def expire() -> None:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            notebook = await session.get(Notebook, notebook_id)
            assert notebook is not None
            notebook.deleted_at = datetime.now(UTC) - timedelta(minutes=2)
            await session.commit()

    asyncio.run(expire())
    assert client.post(f"/notebooks/{notebook_id}/restore", headers=owner).status_code == 410


@pytest.mark.asyncio
async def test_purge_removes_only_notebooks_past_grace_and_their_files() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    storage = MemoryStorage()
    now = datetime.now(UTC)
    async with factory() as session:
        session.add_all(
            [
                Notebook(
                    id="expired",
                    user_id="a",
                    title="Expired",
                    deleted_at=now - timedelta(minutes=1),
                ),
                Notebook(id="recent", user_id="b", title="Recent", deleted_at=now),
                Source(
                    id="old-file",
                    notebook_id="expired",
                    user_id="a",
                    name="old.txt",
                    kind="txt",
                    status="ready",
                    progress=100,
                    storage_key="old/file.txt",
                    metadata_json={},
                ),
                Source(
                    id="new-file",
                    notebook_id="recent",
                    user_id="b",
                    name="new.txt",
                    kind="txt",
                    status="ready",
                    progress=100,
                    storage_key="new/file.txt",
                    metadata_json={},
                ),
            ]
        )
        await session.commit()
    await storage.put("old/file.txt", b"old")
    await storage.put("new/file.txt", b"new")

    purged = await cleanup_deleted_notebooks(
        {
            "settings": Settings(soft_delete_grace_seconds=30),
            "session_factory": factory,
            "storage": storage,
        }
    )

    assert purged == 1
    assert "old/file.txt" not in storage.items
    assert "new/file.txt" in storage.items
    async with factory() as session:
        assert await session.get(Notebook, "expired") is None
        assert await session.get(Notebook, "recent") is not None
        remaining = list((await session.scalars(select(Notebook))).all())
        assert {notebook.id for notebook in remaining} == {"recent"}
    await engine.dispose()
