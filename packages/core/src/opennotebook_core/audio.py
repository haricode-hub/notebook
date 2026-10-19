"""Grounded audio overview schemas and generation helpers."""

import asyncio
import json
import re
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Literal, Protocol, cast

from pydantic import BaseModel, ConfigDict, Field, model_validator

from opennotebook_core.prompts.audio_v1 import (
    faithfulness_messages,
    outline_messages,
    script_messages,
)

WORDS_PER_MINUTE = 150
LENGTH_MINUTES: dict[str, int] = {"short": 3, "default": 8, "long": 15}


def target_word_count(length: str) -> int:
    try:
        return LENGTH_MINUTES[length] * WORDS_PER_MINUTE
    except KeyError as exc:
        raise ValueError("Audio length must be short, default, or long") from exc


class AudioLine(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    speaker: Literal["Maya", "Alex"]
    text: str = Field(min_length=2, max_length=1200)
    citation_refs: list[int] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def valid_refs(self) -> "AudioLine":
        if any(ref <= 0 for ref in self.citation_refs) or len(set(self.citation_refs)) != len(
            self.citation_refs
        ):
            raise ValueError("Audio citation refs must be distinct positive numbers")
        return self


class AudioScript(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    title: str = Field(min_length=1, max_length=200)
    lines: list[AudioLine] = Field(min_length=2, max_length=240)


class AudioOutline(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    beats: list[str] = Field(min_length=2, max_length=12)


class FaithfulnessResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    index: int = Field(ge=0)
    supported: bool
    reason: str = Field(max_length=500)


class FaithfulnessReport(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    results: list[FaithfulnessResult] = Field(max_length=240)


class TimedAudioLine(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    speaker: Literal["Maya", "Alex"]
    text: str
    citation_refs: list[int]
    start: float = Field(ge=0)
    end: float = Field(gt=0)


class AudioOverview(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    recipe: Literal["audio_overview"] = "audio_overview"
    title: str
    transcript: list[TimedAudioLine]
    duration_seconds: float = Field(gt=0)
    target_words: int = Field(gt=0)
    storage_key: str = Field(min_length=1)


class AudioLLM(Protocol):
    def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]: ...


async def _collect(llm: AudioLLM, messages: list[dict[str, str]]) -> str:
    return "".join([piece async for piece in llm.stream(messages)])


async def _validated[T: BaseModel](
    llm: AudioLLM,
    messages: list[dict[str, str]],
    schema: type[T],
    validate: Callable[[T], None] | None = None,
) -> T:
    raw = await _collect(llm, messages)
    for attempt in range(2):
        try:
            cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.I)
            value = schema.model_validate_json(cleaned)
            if validate:
                validate(value)
            return value
        except ValueError as exc:
            if attempt:
                raise ValueError("Audio model returned invalid JSON after repair") from exc
            messages = [
                *messages,
                {"role": "assistant", "content": raw[:12000]},
                {
                    "role": "user",
                    "content": f"Repair this to match the strict JSON schema. {str(exc)[:500]}",
                },
            ]
            raw = await _collect(llm, messages)
    raise AssertionError("unreachable")


def word_count(lines: list[AudioLine]) -> int:
    return sum(len(re.findall(r"\b[\w'-]+\b", line.text)) for line in lines)


async def generate_script(
    llm: AudioLLM,
    evidence: list[dict[str, object]],
    options: dict[str, object],
    progress: Callable[[str], Awaitable[bool]] | None = None,
) -> tuple[AudioScript, list[AudioLine], int]:
    length = str(options.get("length", "default"))
    target = target_word_count(length)
    outline = await _validated(llm, outline_messages(evidence, options), AudioOutline)
    if progress and not await progress("script"):
        raise AudioJobCancelled
    allowed = {cast(int, item["ref"]) for item in evidence}

    def validate_script(value: AudioScript) -> None:
        if any(not set(line.citation_refs) <= allowed for line in value.lines):
            raise ValueError("Audio script contains fabricated source refs")
        actual = word_count(value.lines)
        if not target * 0.70 <= actual <= target * 1.20:
            raise ValueError(f"Audio script has {actual} words; expected about {target}")

    script = await _validated(
        llm,
        script_messages(evidence, outline.beats, options, target),
        AudioScript,
        validate_script,
    )
    if progress and not await progress("faithfulness_check"):
        raise AudioJobCancelled

    def validate_report(value: FaithfulnessReport) -> None:
        if {item.index for item in value.results} != set(range(len(script.lines))):
            raise ValueError("Faithfulness check must evaluate every script line exactly once")

    report = await _validated(
        llm,
        faithfulness_messages(
            evidence,
            [line.model_dump() for line in script.lines],
        ),
        FaithfulnessReport,
        validate_report,
    )
    by_index = {item.index: item for item in report.results}
    kept = [line for index, line in enumerate(script.lines) if by_index[index].supported]
    if len(kept) < 2:
        raise ValueError("Faithfulness check removed the entire script")
    if word_count(kept) < target * 0.70:
        raise ValueError("Faithfulness check removed too much of the requested audio script")
    return script, kept, target


class AudioJobCancelled(Exception):
    """Raised between safe job stages when the user cancels an overview."""


class TTSProvider(Protocol):
    async def synthesize(self, text: str, voice: str) -> bytes: ...


class FakeLLMForAudio:
    """Deterministic fixtures; optional unsupported line exercises the safety pass."""

    def __init__(self, unsupported_line: bool = False) -> None:
        self.unsupported_line = unsupported_line
        self.calls = 0

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        self.calls += 1
        payload = json.loads(messages[1]["content"].split("\nAim for the target word count")[0])
        if payload["task"] == "outline":
            yield '{"beats":["Opening","Evidence","Conclusion"]}'
        elif payload["task"] == "script":
            evidence = payload["evidence"]
            ref = evidence[0]["ref"]
            target = int(payload["target_words"])
            # Alternate speakers and produce a realistic word count for all length options.
            sentence = str(evidence[0].get("text", "The source describes this finding."))
            sentence = re.sub(r"\s+", " ", sentence).strip() or "The source describes this finding."
            words = sentence.split()
            repetitions = max(1, (target + len(words) - 1) // len(words))
            text = " ".join((words * repetitions)[:target])
            lines: list[dict[str, object]] = []
            line_count = max(2, (target + 99) // 100)
            words_per_line = (target + line_count - 1) // line_count
            for index in range(line_count):
                start = index * words_per_line
                part = " ".join(text.split()[start : start + words_per_line])
                if part:
                    lines.append(
                        {
                            "speaker": "Maya" if index % 2 == 0 else "Alex",
                            "text": part,
                            "citation_refs": [ref],
                        }
                    )
            if self.unsupported_line:
                lines.insert(
                    2,
                    {
                        "speaker": "Maya",
                        "text": "Humans live on Mars today.",
                        "citation_refs": [ref],
                    },
                )
            yield json.dumps({"title": "Source overview", "lines": lines})
        else:
            lines = payload["lines"]
            result = [
                {
                    "index": index,
                    "supported": "live on Mars" not in str(line["text"]),
                    "reason": "The cited evidence does not support this statement."
                    if "live on Mars" in str(line["text"])
                    else "Supported by its cited excerpt.",
                }
                for index, line in enumerate(lines)
            ]
            yield json.dumps({"results": result})


class RedisSemaphore(Protocol):
    async def set(self, key: str, value: str, *, nx: bool, ex: int) -> bool: ...
    async def eval(self, script: str, numkeys: int, key: str, token: str) -> int: ...


async def run_with_semaphore[T](
    redis: RedisSemaphore,
    operation: Callable[[], Awaitable[T]],
    *,
    slots: int = 1,
    timeout: float = 1800,
) -> T:
    """Run one operation under a Redis-backed lease semaphore."""
    from uuid import uuid4

    token = str(uuid4())
    keys = [f"tts:semaphore:{slot}" for slot in range(slots)]
    deadline = asyncio.get_running_loop().time() + timeout
    acquired: str | None = None
    while acquired is None:
        for key in keys:
            if await redis.set(key, token, nx=True, ex=3600):
                acquired = key
                break
        if acquired is None:
            if asyncio.get_running_loop().time() >= deadline:
                raise TimeoutError("Audio generation concurrency limit timed out")
            await asyncio.sleep(0.2)
    try:
        return await operation()
    finally:
        release = (
            "if redis.call('get', KEYS[1]) == ARGV[1] "
            "then return redis.call('del', KEYS[1]) else return 0 end"
        )
        await redis.eval(release, 1, acquired, token)
