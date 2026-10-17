"""Enqueue a ping and wait for the running arq worker to persist success."""

import asyncio

from opennotebook_core.config import get_settings
from opennotebook_core.db import make_session_factory
from opennotebook_core.models import Job
from opennotebook_core.queue import ArqQueue


async def main() -> None:
    settings = get_settings()
    factory = make_session_factory(settings)
    async with factory() as session:
        job_id = await ArqQueue(settings.redis_url).enqueue_ping(session, "level-0-smoke")
    for _ in range(30):
        async with factory() as session:
            job = await session.get(Job, job_id)
            if job and job.status == "succeeded":
                print(f"{job_id}: succeeded ({job.result})")
                return
            if job and job.status == "failed":
                raise RuntimeError(f"ping failed: {job.error}")
        await asyncio.sleep(1)
    raise TimeoutError(f"ping job {job_id} did not succeed within 30 seconds")


if __name__ == "__main__":
    asyncio.run(main())
