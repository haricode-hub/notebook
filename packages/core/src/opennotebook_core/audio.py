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
    lines: list[AudioLine] = Field(min_length=2, max_length=48)


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


class AudioOutputValidationError(ValueError):
    """The model produced output that stayed invalid after its repair attempt."""


async def _collect(llm: AudioLLM, messages: list[dict[str, str]]) -> str:
    json_stream = getattr(llm, "stream_json", None)
    stream = json_stream(messages) if callable(json_stream) else llm.stream(messages)
    return "".join([piece async for piece in stream])


def _extract_json_object(raw: str) -> str:
    cleaned = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", raw.strip(), flags=re.I)
    start = cleaned.find("{")
    if start < 0:
        return cleaned
    depth = 0
    quoted = escaped = False
    for index in range(start, len(cleaned)):
        char = cleaned[index]
        if quoted:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return cleaned[start : index + 1]
    return cleaned


async def _validated[T: BaseModel](
    llm: AudioLLM,
    messages: list[dict[str, str]],
    schema: type[T],
    validate: Callable[[T], None] | None = None,
    normalize_raw: Callable[[str], str] | None = None,
) -> T:
    schema_json = json.dumps(schema.model_json_schema(), ensure_ascii=False)
    messages = [dict(message) for message in messages]
    messages[0]["content"] += (
        "\nReturn one JSON object that validates against this exact JSON Schema. "
        f"Do not add fields or wrap the object. Schema: {schema_json}"
    )
    raw = await _collect(llm, messages)
    for attempt in range(2):
        try:
            cleaned = _extract_json_object(raw)
            if normalize_raw:
                cleaned = normalize_raw(cleaned)
            value = schema.model_validate_json(cleaned)
            if validate:
                validate(value)
            return value
        except ValueError as exc:
            if attempt:
                raise AudioOutputValidationError(
                    "Audio response failed schema or grounding validation after repair"
                ) from exc
            messages = [
                *messages,
                {"role": "assistant", "content": raw[:12000]},
                {
                    "role": "user",
                    "content": (
                        "Repair this to match the strict JSON schema. "
                        f"Validation error: {str(exc)[:500]}. Schema: {schema_json}"
                    ),
                },
            ]
            raw = await _collect(llm, messages)
    raise AssertionError("unreachable")


def word_count(lines: list[AudioLine]) -> int:
    return sum(len(re.findall(r"\b[\w'-]+\b", line.text)) for line in lines)


def _fill_unambiguous_citations(raw: str, evidence: list[dict[str, object]]) -> str:
    """Attach the sole supplied excerpt to uncited dialogue before the support check.

    The model sometimes emits empty refs for introductory lines. With one excerpt
    there is no source-selection ambiguity; the later faithfulness pass still
    removes lines unsupported by that excerpt. Never guess among multiple refs.
    """
    if len(evidence) != 1:
        return raw
    payload = json.loads(raw)
    if not isinstance(payload, dict) or not isinstance(payload.get("lines"), list):
        return raw
    ref = evidence[0]["ref"]
    for line in payload["lines"]:
        if isinstance(line, dict) and line.get("citation_refs") == []:
            line["citation_refs"] = [ref]
    return json.dumps(payload, ensure_ascii=False)


async def generate_script(
    llm: AudioLLM,
    evidence: list[dict[str, object]],
    options: dict[str, object],
    progress: Callable[[str], Awaitable[bool]] | None = None,
    fallback_llm: AudioLLM | None = None,
) -> tuple[AudioScript, list[AudioLine], int]:
    length = str(options.get("length", "default"))
    requested_target = target_word_count(length)
    evidence_words = sum(
        len(re.findall(r"\b[\w'-]+\b", str(item.get("text", "")))) for item in evidence
    )
    # A tiny source cannot support a full-length conversation without repetition.
    # Keep the requested duration for substantive notebooks and shorten sparse ones.
    target = min(requested_target, max(240, evidence_words * 10))
    outline = await _validated(llm, outline_messages(evidence, options), AudioOutline)
    if progress and not await progress("script"):
        raise AudioJobCancelled
    allowed = {cast(int, item["ref"]) for item in evidence}

    def validate_script(value: AudioScript) -> None:
        if any(not set(line.citation_refs) <= allowed for line in value.lines):
            raise ValueError("Audio script contains fabricated source refs")

    script_prompt = script_messages(evidence, outline.beats, options, target)
    try:
        script = await _validated(
            llm,
            script_prompt,
            AudioScript,
            validate_script,
            normalize_raw=lambda raw: _fill_unambiguous_citations(raw, evidence),
        )
    except ValueError:
        if fallback_llm is None:
            raise
        if progress and not await progress("script_retry"):
            raise AudioJobCancelled
        script = await _validated(
            fallback_llm,
            script_prompt,
            AudioScript,
            validate_script,
            normalize_raw=lambda raw: _fill_unambiguous_citations(raw, evidence),
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
    # A sparse source may support a shorter script than the requested length.
    # Keep only supported lines and report the resulting length honestly.
    supported_words = word_count(kept)
    return script, kept, min(target, supported_words)


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
