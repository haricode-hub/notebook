"""Token-budgeted map/reduce guides with structured-output repair."""

import asyncio
import hashlib
import json
import re
from collections.abc import AsyncIterator
from typing import Protocol

from cryptography.fernet import Fernet
from pydantic import BaseModel, Field

from opennotebook_core.config import Settings
from opennotebook_core.models import UserSettings
from opennotebook_core.prompts.guide_v1 import VERSION, guide_messages


class Guide(BaseModel):
    summary: str = Field(min_length=1, max_length=1600)
    topics: list[str] = Field(min_length=5, max_length=8)
    questions: list[str] = Field(min_length=3, max_length=3)


class SummaryLLM(Protocol):
    def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]: ...


def cache_key(text: str, *, user_id: str, model_name: str, overview: bool = False) -> str:
    scope = "overview" if overview else "source"
    return hashlib.sha256(
        f"{user_id}\0{scope}\0{VERSION}\0{model_name}\0{text}".encode()
    ).hexdigest()


def budgeted_parts(text: str, max_bytes: int = 6000) -> list[str]:
    """UTF-8 bytes conservatively upper-bound model tokens for every provider."""
    if max_bytes < 100:
        raise ValueError("Summary input budget is too small")
    words = re.findall(r"\S+\s*", text)
    parts: list[str] = []
    current = ""
    for word in words:
        while len(word.encode()) > max_bytes:
            if current:
                parts.append(current.strip())
                current = ""
            prefix = word[:max_bytes]
            while len(prefix.encode()) > max_bytes:
                prefix = prefix[:-1]
            parts.append(prefix.strip())
            word = word[len(prefix) :]
        if len((current + word).encode()) > max_bytes:
            parts.append(current.strip())
            current = ""
        current += word
    if current.strip():
        parts.append(current.strip())
    return parts


async def _collect(llm: SummaryLLM, messages: list[dict[str, str]]) -> str:
    return "".join([part async for part in llm.stream(messages)])


async def _guide_once(llm: SummaryLLM, text: str, *, stage: str, overview: bool) -> Guide:
    messages = guide_messages(text, stage=stage, overview=overview)
    raw = await _collect(llm, messages)
    for attempt in range(2):
        try:
            cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.I)
            return Guide.model_validate_json(cleaned)
        except (ValueError, json.JSONDecodeError) as exc:
            if attempt:
                raise ValueError("Summary model returned invalid guide JSON") from exc
            messages = [
                *messages,
                {"role": "assistant", "content": raw[:5000]},
                {
                    "role": "user",
                    "content": (
                        "Repair this as valid JSON with summary, 5-8 topics, and exactly "
                        "3 questions. Return JSON only."
                    ),
                },
            ]
            raw = await _collect(llm, messages)
    raise AssertionError("unreachable")


async def summarize_text(
    text: str, llm: SummaryLLM, *, max_input_bytes: int = 6000, overview: bool = False
) -> Guide:
    parts = budgeted_parts(text, max_input_bytes)
    if not parts:
        raise ValueError("Cannot summarize empty text")
    if len(parts) == 1:
        return await _guide_once(llm, parts[0], stage="final", overview=overview)
    semaphore = asyncio.Semaphore(4)

    async def map_part(part: str) -> Guide:
        async with semaphore:
            return await _guide_once(llm, part, stage="map", overview=overview)

    guides = list(await asyncio.gather(*(map_part(part) for part in parts)))
    while len(guides) > 1:
        batches: list[str] = []
        current: list[str] = []
        for guide in guides:
            item = guide.model_dump_json()
            candidate = "\n".join([*current, item])
            if current and len(candidate.encode()) > max_input_bytes:
                batches.append("\n".join(current))
                current = []
            current.append(item)
        if current:
            batches.append("\n".join(current))
        if len(batches) == len(guides):
            # The map outputs filled each budget. Keep their first grounded clauses.
            batches = [
                "\n".join(g.summary[:500] for g in guides[index : index + 2])
                for index in range(0, len(guides), 2)
            ]
        guides = list(await asyncio.gather(*(map_part(batch) for batch in batches)))
    return await _guide_once(llm, guides[0].model_dump_json(), stage="final", overview=overview)


class FakeSummaryLLM:
    """Deterministic local provider that uses source words for clickable questions."""

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        payload = json.loads(messages[1]["content"])
        text = str(payload["text"])
        if text.startswith("{"):
            summaries: list[str] = []
            for line in text.splitlines():
                try:
                    item = json.loads(line)
                    if isinstance(item, dict) and isinstance(item.get("summary"), str):
                        summaries.append(item["summary"])
                except ValueError:
                    continue
            if summaries:
                text = " ".join(summaries)
        words = re.findall(r"[A-Za-z][A-Za-z0-9-]+", text)
        keywords = [
            word
            for word in words
            if len(word) >= 4
            and word.lower()
            not in {"this", "that", "with", "from", "source", "about", "there", "which"}
        ]
        subject = " ".join(keywords[:2]) or "the source"
        sentences = re.split(r"(?<=[.!?])\s+", text.strip())
        summary = " ".join(sentences[:3])[:1200] or "Source notes"
        topics = list(dict.fromkeys(keyword.title() for keyword in keywords[:8]))
        topics = (
            topics
            + [
                "Evidence",
                "Context",
                "Details",
                "Applications",
                "Review",
                "Connections",
                "Summary",
                "Questions",
            ]
        )[:5]
        questions = [
            f"What does the source say about {subject}?",
            f"What evidence supports {subject}?",
            f"How is {subject} explained?",
        ]
        yield Guide(summary=summary, topics=topics, questions=questions).model_dump_json()


def configured_summary_llm(settings: Settings, row: UserSettings | None) -> tuple[SummaryLLM, str]:
    """Use the user's cheap model and private key, or the server's default key."""
    if settings.llm_provider == "fake":
        return FakeSummaryLLM(), "fake"
    provider = row.provider if row is not None else "openrouter"
    model = (row.cheap_model or row.chat_model) if row is not None else ""
    model = model or settings.default_cheap_model or settings.default_chat_model
    keys: dict[str, str] = {}
    if row is not None and row.encrypted_keys:
        if not settings.settings_encryption_key:
            raise ValueError("SETTINGS_ENCRYPTION_KEY is required to read user keys")
        keys = json.loads(
            Fernet(settings.settings_encryption_key.encode()).decrypt(row.encrypted_keys.encode())
        )
    server_keys = {
        "openrouter": settings.openrouter_api_key,
        "gemini": settings.gemini_api_key,
        "openai": settings.openai_api_key,
        "anthropic": settings.anthropic_api_key,
    }
    key = keys.get(provider) or server_keys.get(provider, "")
    if not model or (provider != "ollama" and not key):
        raise ValueError("Configure a cheap model and API key in Settings to generate guides")
    from opennotebook_core.llm import make_llm

    chosen = settings.model_copy(
        update={
            "llm_provider": provider,
            "default_chat_model": model,
            f"{provider}_api_key": key,
            "ollama_base_url": row.ollama_base_url or settings.ollama_base_url
            if row
            else settings.ollama_base_url,
        }
    )
    return make_llm(chosen), model
