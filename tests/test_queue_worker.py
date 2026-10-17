from typing import Any, cast

import pytest
from arq.connections import ArqRedis
from opennotebook_core.models import Base, Job
from opennotebook_core.queue import ArqQueue
from opennotebook_worker.main import ping
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


class FakePool:
    def __init__(self) -> None:
        self.enqueued: list[str] = []

    async def enqueue_job(self, function: str, job_id: str, **kwargs: Any) -> None:
        assert function == "ping"
        self.enqueued.append(job_id)


@pytest.mark.asyncio
async def test_queue_ping_persists_success(tmp_path: Any) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'jobs.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    pool = FakePool()
    async with factory() as session:
        job_id = await ArqQueue("redis://unused", cast(ArqRedis, pool)).enqueue_ping(
            session, "user-1"
        )
    assert pool.enqueued == [job_id]
    assert await ping({"session_factory": factory}, job_id) == "pong"
    async with factory() as session:
        job = await session.get(Job, job_id)
        assert job is not None
        assert job.status == "succeeded"
        assert job.result == "pong"
    await engine.dispose()
