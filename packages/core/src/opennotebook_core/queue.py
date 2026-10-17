from typing import Protocol
from uuid import uuid4

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings
from sqlalchemy.ext.asyncio import AsyncSession

from opennotebook_core.models import Job


class JobQueue(Protocol):
    async def enqueue_ping(self, session: AsyncSession, user_id: str) -> str: ...


class ArqQueue:
    def __init__(self, redis_url: str, pool: ArqRedis | None = None):
        self.redis_url = redis_url
        self.pool = pool

    async def enqueue_ping(self, session: AsyncSession, user_id: str) -> str:
        job_id = str(uuid4())
        session.add(Job(id=job_id, user_id=user_id, kind="ping", status="queued"))
        await session.commit()
        pool = self.pool or await create_pool(RedisSettings.from_dsn(self.redis_url))
        try:
            await pool.enqueue_job("ping", job_id, _job_id=job_id)
        except Exception:
            job = await session.get(Job, job_id)
            if job:
                job.status = "failed"
                job.error = "queue unavailable"
                await session.commit()
            raise
        finally:
            if self.pool is None:
                await pool.aclose()
        return job_id
