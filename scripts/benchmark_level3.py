"""Measure first OpenRouter token after retrieval from a synthetic indexed 100-page book.

Set OPENROUTER_API_KEY and DEFAULT_CHAT_MODEL in .env, then run
`uv run --frozen --all-packages python scripts/benchmark_level3.py`.
"""

import asyncio
import time
from collections.abc import AsyncGenerator
from typing import cast

from opennotebook_core.config import Settings
from opennotebook_core.embeddings import FakeEmbedding
from opennotebook_core.llm import LiteLLMProvider
from opennotebook_core.models import Base, Chunk, Notebook, Source
from opennotebook_core.prompts.chat_v1 import build_chat_messages
from opennotebook_core.retrieval import select_context
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


async def benchmark() -> float:
    settings = Settings()
    if not settings.openrouter_api_key or not settings.default_chat_model:
        raise SystemExit("Set OPENROUTER_API_KEY and DEFAULT_CHAT_MODEL in .env first")
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    embedding = FakeEmbedding()
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as db:
            db.add(
                Notebook(
                    id="benchmark", user_id="benchmark", title="100 pages", response_length="short"
                )
            )
            await db.flush()
            db.add(
                Source(
                    id="benchmark-source",
                    notebook_id="benchmark",
                    user_id="benchmark",
                    name="100-page book",
                    kind="txt",
                    status="ready",
                    selected=True,
                    progress=100,
                    metadata_json={},
                )
            )
            await db.flush()
            for page in range(1, 101):
                text = f"Page {page}. The launch code is BLUEBIRD-42. " + (
                    "This page contains background research details. " * 35
                )
                db.add(
                    Chunk(
                        id=f"page-{page}",
                        source_id="benchmark-source",
                        notebook_id="benchmark",
                        ordinal=page - 1,
                        text=text,
                        page_start=page,
                        page_end=page,
                        char_start=0,
                        char_end=len(text),
                        heading_path=[],
                        embedding=(await embedding.embed([text], "document", 768))[0],
                        metadata_json={},
                    )
                )
            await db.commit()
            question = "What is the launch code?"
            start = time.perf_counter()
            selection = await select_context(
                db,
                embedding,
                "benchmark",
                ["benchmark-source"],
                question,
                context_window=settings.chat_context_tokens,
            )
            prompt = build_chat_messages(
                selection, question, [], persona=None, response_length="short"
            )
            stream = cast(
                AsyncGenerator[str],
                LiteLLMProvider(settings.model_copy(update={"llm_provider": "openrouter"})).stream(
                    prompt
                ),
            )
            try:
                await anext(stream)
                elapsed = time.perf_counter() - start
            finally:
                await stream.aclose()
            return elapsed
    finally:
        await engine.dispose()


if __name__ == "__main__":
    seconds = asyncio.run(benchmark())
    print(f"100-page first token: {seconds:.3f} s")
    if seconds >= 3:
        raise SystemExit(1)
