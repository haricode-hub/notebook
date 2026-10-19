"""Level 5 summary budgets, cache/debounce, notes, and source conversion."""

import json
from collections.abc import AsyncIterator
from typing import Any, cast

import httpx
import pytest
from arq.connections import ArqRedis
from opennotebook_api.routers import sources as sources_router
from opennotebook_core.config import Settings
from opennotebook_core.embeddings import FakeEmbedding
from opennotebook_core.llm import GroundedFakeLLMProvider
from opennotebook_core.models import Job, NotebookOverview, Source, SourceGuide
from opennotebook_core.queue import schedule_overview
from opennotebook_core.storage import MemoryStorage
from opennotebook_core.summarization import Guide, budgeted_parts, summarize_text
from opennotebook_worker.main import ingest_source, refresh_notebook_overview, summarize_source
from sqlalchemy import select
from test_level1 import auth
from test_level3_chat import AllowAll, events, seeded_book

pytest_plugins = ["test_level1"]


class SummarySpy:
    def __init__(self) -> None:
        self.calls: list[list[dict[str, str]]] = []

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        self.calls.append(messages)
        yield Guide(
            summary="The launch code is BLUEBIRD-42 and the source explains its use.",
            topics=["Launch", "Code", "Evidence", "Use", "Review"],
            questions=["What is the launch code?", "How is it used?", "What evidence supports it?"],
        ).model_dump_json()


class QueueFake:
    def __init__(self) -> None:
        self.values: dict[str, bytes] = {}
        self.jobs: list[tuple[str, tuple[object, ...], dict[str, object]]] = []

    async def set(self, key: str, value: str, ex: int) -> None:
        assert ex >= 30
        self.values[key] = value.encode()

    async def get(self, key: str) -> bytes | None:
        return self.values.get(key)

    async def enqueue_job(self, name: str, *args: object, **kwargs: object) -> None:
        self.jobs.append((name, args, kwargs))

    async def publish(self, _channel: str, _message: str) -> None:
        return None

    async def aclose(self) -> None:
        return None


@pytest.mark.asyncio
async def test_long_map_reduce_stays_in_budget_and_repairs_once() -> None:
    fixture = "The launch code is BLUEBIRD-42. It identifies the research mission. " * 500
    assert len(budgeted_parts(fixture, 1000)) > 10
    spy = SummarySpy()
    guide = await summarize_text(fixture, spy, max_input_bytes=1000)
    assert "BLUEBIRD-42" in guide.summary
    assert len(guide.topics) >= 5 and len(guide.questions) == 3
    assert len(spy.calls) > 10
    assert all(len(json.loads(call[1]["content"])["text"].encode()) <= 1000 for call in spy.calls)


@pytest.mark.asyncio
async def test_summary_cache_and_overview_debounce(level1_app: Any) -> None:
    app, keys, _, _ = level1_app
    spy = SummarySpy()
    queue = QueueFake()
    settings = Settings(llm_provider="fake", embed_backend="fake", summary_map_max_bytes=1000)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        owner = auth(keys.token("owner"))
        notebook_id = (
            await client.post("/notebooks", headers=owner, json={"title": "Summaries"})
        ).json()["id"]
        async with app.state.session_factory() as session:
            session.add(
                Source(
                    id="source-guide",
                    notebook_id=notebook_id,
                    user_id="owner",
                    name="guide.txt",
                    kind="txt",
                    status="ready",
                    progress=100,
                    extracted_text="The launch code is BLUEBIRD-42.",
                    metadata_json={},
                )
            )
            session.add(
                Job(id="summary-1", user_id="owner", kind="summarize_source", status="queued")
            )
            await session.commit()
        ctx = {
            "settings": settings,
            "session_factory": app.state.session_factory,
            "redis": queue,
            "summary_llm": (spy, "fake"),
        }
        await summarize_source(ctx, "source-guide", "summary-1")
        assert len(spy.calls) == 1
        guide = (
            await client.get(f"/notebooks/{notebook_id}/sources/source-guide/guide", headers=owner)
        ).json()
        assert guide["status"] == "ready" and len(guide["questions"]) == 3
        assert (
            await client.get(
                f"/notebooks/{notebook_id}/sources/source-guide/guide",
                headers=auth(keys.token("other")),
            )
        ).status_code == 404
        async with app.state.session_factory() as session:
            session.add(
                Job(id="summary-2", user_id="owner", kind="summarize_source", status="queued")
            )
            await session.commit()
        await summarize_source(ctx, "source-guide", "summary-2")
        assert len(spy.calls) == 1
        first_overview = [job for job in queue.jobs if job[0] == "refresh_notebook_overview"][0][1][
            1
        ]
        async with app.state.session_factory() as session:
            latest = await schedule_overview(cast(ArqRedis, queue), session, notebook_id, "owner")
        assert latest != first_overview
        await refresh_notebook_overview(ctx, notebook_id, str(first_overview))
        assert len(spy.calls) == 1
        await refresh_notebook_overview(ctx, notebook_id, latest)
        assert len(spy.calls) == 2
        overview = (await client.get(f"/notebooks/{notebook_id}/overview", headers=owner)).json()
        assert overview["status"] == "ready" and len(overview["questions"]) == 3
        assert (
            await client.get(
                f"/notebooks/{notebook_id}/overview", headers=auth(keys.token("other"))
            )
        ).status_code == 404
        async with app.state.session_factory() as session:
            previous = await session.get(NotebookOverview, notebook_id)
            assert previous is not None
            old_hash = previous.content_hash
            assert (await session.get(SourceGuide, "source-guide")) is not None
            session.add(
                Source(
                    id="source-two",
                    notebook_id=notebook_id,
                    user_id="owner",
                    name="second.txt",
                    kind="txt",
                    status="ready",
                    progress=100,
                    extracted_text="A second source.",
                    metadata_json={},
                )
            )
            await session.flush()
            session.add(
                SourceGuide(
                    source_id="source-two",
                    notebook_id=notebook_id,
                    user_id="owner",
                    content_hash="second-hash",
                    status="ready",
                    summary="A second source explains the mission.",
                    topics=["Mission", "Source", "Detail", "Evidence", "Study"],
                    questions=[
                        "What is the mission?",
                        "What is explained?",
                        "What evidence is given?",
                    ],
                    model_name="fake",
                )
            )
            await session.commit()
            updated_job = await schedule_overview(
                cast(ArqRedis, queue), session, notebook_id, "owner"
            )
        await refresh_notebook_overview(ctx, notebook_id, updated_job)
        assert len(spy.calls) == 3
        async with app.state.session_factory() as session:
            changed = await session.get(NotebookOverview, notebook_id)
            assert changed is not None and changed.content_hash != old_hash


@pytest.mark.asyncio
async def test_note_crud_saved_citations_and_convert_to_searchable_source(
    level1_app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    app, keys, _, _ = level1_app
    app.state.chat_limiter = AllowAll()
    app.state.llm_factory = lambda _: GroundedFakeLLMProvider()
    storage = MemoryStorage()
    queue = QueueFake()
    monkeypatch.setattr(sources_router, "make_storage", lambda _: storage)

    async def make_pool(*_args: object, **_kwargs: object) -> QueueFake:
        return queue

    monkeypatch.setattr(sources_router, "create_pool", make_pool)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        book = await seeded_book(app, client, keys, "The launch code is BLUEBIRD-42.")
        async with app.state.session_factory() as session:
            evidence = await session.get(Source, "evidence")
            assert evidence is not None
            evidence.embedding_model = "fake"
            evidence.embedding_dim = 768
            await session.commit()
        owner, other = auth(keys.token("owner")), auth(keys.token("other"))
        path = f"/notebooks/{book}/notes"
        created = await client.post(
            path,
            headers=owner,
            json={"title": "My note", "content_markdown": "# Research", "pinned": False},
        )
        assert created.status_code == 201
        note_id = created.json()["id"]
        assert (await client.get(path, headers=owner)).json()[0]["id"] == note_id
        assert (await client.get(f"{path}/{note_id}", headers=other)).status_code == 404
        patched = await client.patch(
            f"{path}/{note_id}", headers=owner, json={"pinned": True, "title": "Pinned note"}
        )
        assert patched.json()["pinned"] is True
        answer = events(
            await client.post(
                f"/notebooks/{book}/chat",
                headers=owner,
                json={"question": "What is the launch code?"},
            )
        )[-1][1]
        saved = await client.post(f"{path}/from-chat/{answer['message_id']}", headers=owner)
        assert saved.status_code == 201
        saved_note = saved.json()
        assert saved_note["citations"][0]["source_id"] == "evidence"
        assert saved_note["citations"][0]["chunk_id"] == "fact"
        assert (
            await client.post(f"{path}/from-chat/{answer['message_id']}", headers=other)
        ).status_code == 404
        converted = await client.post(f"{path}/{saved_note['id']}/convert-to-source", headers=owner)
        assert converted.status_code == 201
        source_id = converted.json()["id"]
        assert (
            await client.post(f"{path}/{saved_note['id']}/convert-to-source", headers=owner)
        ).json()["id"] == source_id
        async with app.state.session_factory() as session:
            source = await session.get(Source, source_id)
            job = (
                await session.scalars(
                    select(Job).where(Job.kind == "ingest_source", Job.user_id == "owner")
                )
            ).one()
        assert source is not None
        await ingest_source(
            {
                "settings": Settings(embed_backend="fake", llm_provider="fake"),
                "session_factory": app.state.session_factory,
                "storage": storage,
                "embedding": FakeEmbedding(),
                "redis": queue,
            },
            source_id,
            job.id,
        )
        assert (await client.get(f"/notebooks/{book}/sources/{source_id}", headers=owner)).json()[
            "status"
        ] == "ready"
        await client.patch(
            f"/notebooks/{book}/sources/evidence", headers=owner, json={"selected": False}
        )
        followup = events(
            await client.post(
                f"/notebooks/{book}/chat",
                headers=owner,
                json={"question": "What is the launch code?"},
            )
        )[-1][1]
        assert "BLUEBIRD-42" in followup["content"]
        assert followup["citations"][0]["source_id"] == source_id
        assert (await client.delete(f"{path}/{note_id}", headers=owner)).status_code == 204
        assert (await client.get(f"{path}/{note_id}", headers=owner)).status_code == 404
