"""Level 8 audio schema, grounding, stitching, and concurrency checks."""

import asyncio
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from opennotebook_api.routers import artifacts as artifacts_router
from opennotebook_core.audio import (
    AudioLine,
    AudioScript,
    FakeLLMForAudio,
    generate_script,
    run_with_semaphore,
    target_word_count,
    word_count,
)
from opennotebook_core.config import Settings
from opennotebook_core.embeddings import FakeEmbedding
from opennotebook_core.models import Chunk
from opennotebook_core.storage import MemoryStorage
from opennotebook_core.tts import FakeTTS, mp3_duration, stitch_mp3
from opennotebook_worker.main import generate_audio_overview
from pydantic import ValidationError
from redis.asyncio import Redis
from test_level1 import auth
from test_level3_chat import seeded_book
from test_level5 import QueueFake

pytest_plugins = ["test_level1"]


def test_audio_script_schema_and_length_control() -> None:
    assert target_word_count("short") == 450
    assert target_word_count("default") == 1200
    assert target_word_count("long") == 2250
    with pytest.raises(ValidationError):
        AudioScript.model_validate(
            {"title": "Podcast", "lines": [{"speaker": "A", "text": "Hi", "citation_refs": [1]}]}
        )
    with pytest.raises(ValidationError):
        AudioLine(speaker="Maya", text="Fact", citation_refs=[1, 1])


@pytest.mark.asyncio
async def test_faithfulness_removes_injected_unsupported_line() -> None:
    llm = FakeLLMForAudio(unsupported_line=True)
    _script, kept, target = await generate_script(
        llm,
        [{"ref": 1, "source": "Biology.txt", "text": "Cells transfer energy through respiration."}],
        {"length": "short", "tone": "conversational"},
    )
    assert target == 450
    assert word_count(kept) <= 450
    assert all("Mars" not in line.text for line in kept)
    assert llm.calls == 3


@pytest.mark.asyncio
async def test_audio_json_schema_gets_one_repair_attempt() -> None:
    class BrokenOutlineOnce(FakeLLMForAudio):
        async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
            import json

            payload = json.loads(messages[1]["content"].split("\nAim for the target word count")[0])
            if payload["task"] == "outline" and self.calls == 0:
                self.calls += 1
                yield "not JSON"
                return
            async for part in super().stream(messages):
                yield part

    llm = BrokenOutlineOnce()
    _script, lines, _target = await generate_script(
        llm,
        [{"ref": 1, "source": "Biology.txt", "text": "Cells transfer energy through respiration."}],
        {"length": "short"},
    )
    assert lines and llm.calls == 4


@pytest.mark.asyncio
async def test_fake_tts_stitch_is_valid_mp3_at_expected_duration() -> None:
    tts = FakeTTS()
    segments = [
        await tts.synthesize("one two three four five", "af_heart"),
        await tts.synthesize("six seven eight nine ten", "am_michael"),
    ]
    expected = 4.0
    mp3 = await asyncio.to_thread(stitch_mp3, segments, expected_seconds=expected)
    duration = await asyncio.to_thread(mp3_duration, mp3)
    assert mp3.startswith(b"ID3") or mp3[:1] == b"\xff"
    assert abs(duration - expected) <= expected * 0.10


class MemoryRedis:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.lock = asyncio.Lock()

    async def set(self, key: str, value: str, *, nx: bool = False, ex: int = 0) -> bool:
        async with self.lock:
            if nx and key in self.values:
                return False
            self.values[key] = value
            return True

    async def get(self, key: str) -> str | None:
        return self.values.get(key)

    async def eval(self, _script: str, _numkeys: int, key: str, token: str) -> int:
        async with self.lock:
            if self.values.get(key) == token:
                del self.values[key]
                return 1
            return 0

    async def publish(self, _channel: str, _message: str) -> None:
        return None

    async def aclose(self) -> None:
        return None


@pytest.mark.asyncio
async def test_tts_redis_semaphore_caps_concurrent_synthesis() -> None:
    redis = MemoryRedis()
    active = maximum = 0

    async def operation() -> None:
        nonlocal active, maximum
        active += 1
        maximum = max(maximum, active)
        await asyncio.sleep(0.02)
        active -= 1

    await asyncio.gather(
        *(run_with_semaphore(redis, operation, slots=1, timeout=1) for _ in range(3))
    )
    assert maximum == 1
    assert redis.values == {}


@pytest.mark.asyncio
async def test_audio_overview_api_worker_storage_and_download(
    level1_app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    app, keys, _, _engine = level1_app
    settings = Settings(
        llm_provider="fake",
        embed_backend="fake",
        tts_provider="fake",
        storage_backend="memory",
    )
    app.state.settings = settings
    storage = MemoryStorage()
    monkeypatch.setattr(artifacts_router, "make_storage", lambda _settings: storage)
    queue = QueueFake()

    async def make_pool(*_args: object, **_kwargs: object) -> QueueFake:
        return queue

    monkeypatch.setattr(artifacts_router, "create_pool", make_pool)
    owner = auth(keys.token("owner"))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        notebook_id = await seeded_book(
            app, client, keys, "Cells transfer energy through cellular respiration."
        )
        page_texts = [
            f"Page {page} explains that cells transfer energy through cellular respiration."
            for page in range(2, 31)
        ]
        vectors = await FakeEmbedding().embed(page_texts, "document", 768)
        async with app.state.session_factory() as session:
            for page, (text, vector) in enumerate(zip(page_texts, vectors, strict=True), 2):
                session.add(
                    Chunk(
                        id=f"page-{page}",
                        source_id="evidence",
                        notebook_id=notebook_id,
                        ordinal=page - 1,
                        text=text,
                        page_start=page,
                        page_end=page,
                        char_start=0,
                        char_end=len(text),
                        heading_path=[],
                        embedding=vector,
                        metadata_json={},
                    )
                )
            await session.commit()
        path = f"/notebooks/{notebook_id}/artifacts"
        created = await client.post(
            path,
            headers=owner,
            json={"recipe": "audio_overview", "source_ids": ["evidence"], "length": "short"},
        )
        assert created.status_code == 202
        artifact_id = created.json()["id"]
        assert queue.jobs[-1][0] == "generate_audio_overview"
        duplicate = await client.post(
            path,
            headers=owner,
            json={"recipe": "audio_overview", "source_ids": ["evidence"], "length": "short"},
        )
        assert duplicate.status_code == 409
        redis = MemoryRedis()
        await generate_audio_overview(
            {
                "settings": settings,
                "session_factory": app.state.session_factory,
                "redis": redis,
                "audio_llm": FakeLLMForAudio(unsupported_line=True),
                "tts_provider": FakeTTS(),
                "storage": storage,
            },
            artifact_id,
        )
        ready = (await client.get(f"{path}/{artifact_id}", headers=owner)).json()
        assert ready["status"] == "ready", ready.get("error")
        assert ready["prompt_version"] == "audio-v1"
        assert all("Mars" not in line["text"] for line in ready["output"]["transcript"])
        audio = await client.get(f"{path}/{artifact_id}/audio", headers=owner)
        assert audio.status_code == 200 and audio.content.startswith(b"ID3")
        other = await client.get(f"{path}/{artifact_id}/audio", headers=auth(keys.token("other")))
        assert other.status_code == 404
        assert (await client.delete(f"{path}/{artifact_id}", headers=owner)).status_code == 204

        started = time.perf_counter()
        default_length = await client.post(
            path,
            headers=owner,
            json={"recipe": "audio_overview", "source_ids": ["evidence"], "length": "default"},
        )
        default_id = default_length.json()["id"]
        await generate_audio_overview(
            {
                "settings": settings,
                "session_factory": app.state.session_factory,
                "redis": MemoryRedis(),
                "audio_llm": FakeLLMForAudio(),
                "tts_provider": FakeTTS(),
                "storage": storage,
            },
            default_id,
        )
        elapsed = time.perf_counter() - started
        default_ready = (await client.get(f"{path}/{default_id}", headers=owner)).json()
        assert default_ready["status"] == "ready", default_ready.get("error")
        expected = 8 * 60
        duration = default_ready["output"]["duration_seconds"]
        assert abs(duration - expected) <= expected * 0.10
        assert elapsed < 360
        assert (await client.delete(f"{path}/{default_id}", headers=owner)).status_code == 204

        queued = await client.post(
            path,
            headers=owner,
            json={"recipe": "audio_overview", "source_ids": ["evidence"], "length": "short"},
        )
        assert queued.status_code == 202
        redis = MemoryRedis()
        monkeypatch.setattr(Redis, "from_url", lambda _url: redis)
        cancelled = await client.post(f"{path}/{queued.json()['id']}/cancel", headers=owner)
        assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
        assert (
            await client.delete(f"{path}/{queued.json()['id']}", headers=owner)
        ).status_code == 204
