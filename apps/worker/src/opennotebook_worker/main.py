from typing import Any

from arq.connections import RedisSettings
from opennotebook_core.config import get_settings
from opennotebook_core.db import make_session_factory
from opennotebook_core.models import Job


async def ping(ctx: dict[str, Any], job_id: str) -> str:
    factory = ctx.get("session_factory") or make_session_factory(get_settings())
    async with factory() as session:
        job = await session.get(Job, job_id)
        if job is None:
            raise ValueError("job not found")
        job.status = "succeeded"
        job.result = "pong"
        await session.commit()
    return "pong"


class WorkerSettings:
    functions = [ping]
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    max_jobs = 2
    job_timeout = 120
