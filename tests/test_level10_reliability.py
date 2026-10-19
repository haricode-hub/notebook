import time

import pytest
from opennotebook_core.config import Settings
from opennotebook_core.models import Base, Notebook, Source
from opennotebook_core.storage import MemoryStorage
from opennotebook_worker.main import WorkerSettings, _retry_delay, cleanup_orphaned_storage
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


def test_worker_retry_policy_is_bounded() -> None:
    assert WorkerSettings.max_tries >= 2
    assert WorkerSettings.job_timeout == 3600
    settings = Settings(job_max_tries=3)
    assert _retry_delay({"job_try": 1}, settings) == 1
    assert _retry_delay({"job_try": 2}, settings) == 2
    assert _retry_delay({"job_try": 3}, settings) is None


@pytest.mark.asyncio
async def test_storage_cleanup_respects_grace_window() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    settings = Settings(orphan_file_grace_hours=24)
    storage = MemoryStorage()
    factory = async_sessionmaker(engine, expire_on_commit=False)
    await storage.put("orphan/old.txt", b"old")
    await storage.put("orphan/new.txt", b"new")
    await storage.put("sources/kept.txt", b"referenced")
    storage.created_at["orphan/old.txt"] = time.time() - 25 * 3600
    storage.created_at["sources/kept.txt"] = time.time() - 25 * 3600
    async with factory() as session:
        session.add(Notebook(id="cleanup-book", user_id="u", title="Cleanup test"))
        session.add(
            Source(
                id="cleanup-source",
                notebook_id="cleanup-book",
                user_id="u",
                name="kept.txt",
                kind="txt",
                status="ready",
                progress=100,
                storage_key="sources/kept.txt",
                metadata_json={},
            )
        )
        await session.commit()
    removed = await cleanup_orphaned_storage(
        {"settings": settings, "session_factory": factory, "storage": storage}
    )
    assert removed == 1
    assert "orphan/old.txt" not in storage.items
    assert "orphan/new.txt" in storage.items
    assert "sources/kept.txt" in storage.items
    await engine.dispose()
