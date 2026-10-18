import asyncio
from collections.abc import AsyncIterator
from typing import Protocol

import litellm

from opennotebook_core.config import Settings


class LLMProvider(Protocol):
    def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]: ...


class FakeLLMProvider:
    def __init__(self, response: str = "Fixture answer"):
        self.response = response

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        if not messages:
            raise ValueError("messages required")
        yield self.response


class LiteLLMProvider:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.semaphore = asyncio.Semaphore(settings.llm_concurrency)

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        if not self.settings.default_chat_model:
            raise ValueError("DEFAULT_CHAT_MODEL is required for live LLM calls")
        model = self.settings.default_chat_model
        prefix = f"{self.settings.llm_provider}/"
        if not model.startswith(prefix):
            model = f"{prefix}{model}"
        keys = {
            "openrouter": self.settings.openrouter_api_key,
            "gemini": self.settings.gemini_api_key,
            "openai": self.settings.openai_api_key,
            "anthropic": self.settings.anthropic_api_key,
        }
        async with self.semaphore:
            for attempt in range(3):
                try:
                    response = await litellm.acompletion(
                        model=model,
                        messages=messages,
                        api_key=keys.get(self.settings.llm_provider) or None,
                        api_base=(
                            self.settings.ollama_base_url
                            if self.settings.llm_provider == "ollama"
                            else None
                        ),
                        stream=True,
                        timeout=60,
                    )
                    async for part in response:
                        content = part.choices[0].delta.content
                        if content:
                            yield content
                    return
                except Exception:
                    if attempt == 2:
                        raise
                    await asyncio.sleep(2**attempt)


def make_llm(settings: Settings) -> LLMProvider:
    if settings.llm_provider == "fake":
        return FakeLLMProvider()
    return LiteLLMProvider(settings)
