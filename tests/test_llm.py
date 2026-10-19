from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any

import litellm
import pytest
from opennotebook_core.config import Settings
from opennotebook_core.llm import FakeLLMProvider, LiteLLMProvider, make_llm


@pytest.mark.asyncio
async def test_fake_llm_selected_by_env() -> None:
    provider = make_llm(Settings(llm_provider="fake"))
    assert isinstance(provider, FakeLLMProvider)
    assert [part async for part in provider.stream([{"role": "user", "content": "hello"}])] == [
        "Fixture answer"
    ]


@pytest.mark.asyncio
async def test_litellm_routes_selected_provider_key(monkeypatch: pytest.MonkeyPatch) -> None:
    observed: dict[str, Any] = {}

    async def fake_completion(**kwargs: Any) -> AsyncIterator[Any]:
        observed.update(kwargs)

        async def parts() -> AsyncIterator[Any]:
            yield SimpleNamespace(
                choices=[SimpleNamespace(delta=SimpleNamespace(content="answer"))]
            )

        return parts()

    monkeypatch.setattr(litellm, "acompletion", fake_completion)
    settings = Settings(
        llm_provider="gemini", default_chat_model="example", gemini_api_key="gemini-key"
    )
    output = [
        part async for part in LiteLLMProvider(settings).stream([{"role": "user", "content": "hi"}])
    ]
    assert output == ["answer"]
    assert observed["model"] == "gemini/example"
    assert observed["api_key"] == "gemini-key"


@pytest.mark.asyncio
async def test_litellm_uses_fallback_after_primary_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    observed: list[str] = []

    async def no_wait(_seconds: float) -> None:
        return None

    async def fake_completion(**kwargs: Any) -> AsyncIterator[Any]:
        observed.append(kwargs["model"])
        if kwargs["model"] == "openrouter/primary":
            raise RuntimeError("primary unavailable")

        async def parts() -> AsyncIterator[Any]:
            yield SimpleNamespace(
                choices=[SimpleNamespace(delta=SimpleNamespace(content="fallback answer"))]
            )

        return parts()

    monkeypatch.setattr(litellm, "acompletion", fake_completion)
    monkeypatch.setattr("opennotebook_core.llm.asyncio.sleep", no_wait)
    settings = Settings(
        llm_provider="openrouter",
        default_chat_model="primary",
        fallback_model="backup",
        openrouter_api_key="test-key",
    )
    output = [
        part async for part in LiteLLMProvider(settings).stream([{"role": "user", "content": "hi"}])
    ]
    assert output == ["fallback answer"]
    assert observed == ["openrouter/primary"] * 3 + ["openrouter/backup"]
