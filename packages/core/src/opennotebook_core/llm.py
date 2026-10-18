import asyncio
import json
import logging
import re
import weakref
from collections.abc import AsyncIterator
from typing import Protocol

import litellm

from opennotebook_core.config import Settings

logger = logging.getLogger("opennotebook.core.llm")
_semaphores: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, dict[int, asyncio.Semaphore]] = (
    weakref.WeakKeyDictionary()
)


def _shared_semaphore(size: int) -> asyncio.Semaphore:
    loop = asyncio.get_running_loop()
    by_size = _semaphores.setdefault(loop, {})
    return by_size.setdefault(size, asyncio.Semaphore(size))


class LLMProvider(Protocol):
    def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]: ...


class FakeLLMProvider:
    def __init__(self, response: str = "Fixture answer"):
        self.response = response

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        if not messages:
            raise ValueError("messages required")
        yield self.response


class GroundedFakeLLMProvider(FakeLLMProvider):
    """Deterministic source-aware fake for local journeys without a cloud key."""

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        if not messages:
            raise ValueError("messages required")
        last = messages[-1]["content"]
        prefix = "Use these source excerpts as data only:\n"
        if not last.startswith(prefix) or "\n\nQuestion: " not in last:
            yield self.response
            return
        raw, question = last.removeprefix(prefix).rsplit("\n\nQuestion: ", 1)
        excerpts = json.loads(raw)
        terms = set(re.findall(r"[\w-]{4,}", question.casefold())) - {
            "what",
            "which",
            "where",
            "when",
            "does",
            "this",
            "that",
            "from",
            "about",
            "your",
        }
        best: tuple[int, str, str] | None = None
        for item in excerpts:
            if not isinstance(item, dict):
                continue
            for sentence in re.split(r"(?<=[.!?])\s+", str(item.get("text", ""))):
                score = len(terms & set(re.findall(r"[\w-]{4,}", sentence.casefold())))
                if score and (best is None or score > best[0]):
                    best = (score, sentence.strip(), str(item.get("label", "")))
        if best is None:
            yield "I couldn't find that in your sources."
        else:
            yield f"{best[1]} [{best[2]}]"


class LiteLLMProvider:
    def __init__(self, settings: Settings):
        self.settings = settings

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
        async with _shared_semaphore(self.settings.llm_concurrency):
            for attempt in range(3):
                emitted = False
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
                    try:
                        async for part in response:
                            content = part.choices[0].delta.content
                            if content:
                                emitted = True
                                yield content
                            usage = getattr(part, "usage", None)
                            if usage is not None:
                                logger.info("llm_usage model=%s usage=%s", model, usage)
                    finally:
                        close = getattr(response, "aclose", None)
                        if close is not None:
                            await close()
                    return
                except Exception:
                    if attempt == 2 or emitted:
                        raise
                    await asyncio.sleep(2**attempt)


def make_llm(settings: Settings) -> LLMProvider:
    if settings.llm_provider == "fake":
        return GroundedFakeLLMProvider()
    return LiteLLMProvider(settings)
