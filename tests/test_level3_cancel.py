"""Closing a client stream must close the upstream model stream promptly."""

import asyncio
from types import SimpleNamespace
from typing import Any

import pytest
from opennotebook_core.config import Settings
from opennotebook_core.llm import LiteLLMProvider


@pytest.mark.asyncio
async def test_cancel_closes_upstream_in_under_one_second(monkeypatch: Any) -> None:
    closed = asyncio.Event()

    class Upstream:
        def __init__(self) -> None:
            self.calls = 0

        def __aiter__(self) -> "Upstream":
            return self

        async def __anext__(self) -> Any:
            self.calls += 1
            if self.calls == 1:
                return SimpleNamespace(
                    choices=[SimpleNamespace(delta=SimpleNamespace(content="A"))], usage=None
                )
            await asyncio.sleep(30)
            raise StopAsyncIteration

        async def aclose(self) -> None:
            closed.set()

    async def completion(**_: Any) -> Upstream:
        return Upstream()

    monkeypatch.setattr("opennotebook_core.llm.litellm.acompletion", completion)
    settings = Settings(
        llm_provider="openrouter", default_chat_model="test-model", openrouter_api_key="test-key"
    )
    stream = LiteLLMProvider(settings).stream([{"role": "user", "content": "question"}])
    assert await anext(stream) == "A"
    async def next_token() -> str:
        return await anext(stream)

    waiting = asyncio.create_task(next_token())
    await asyncio.sleep(0.01)
    waiting.cancel()
    with pytest.raises(asyncio.CancelledError):
        await waiting
    await asyncio.wait_for(closed.wait(), timeout=1)
