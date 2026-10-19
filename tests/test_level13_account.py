import io
import zipfile
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from opennotebook_api.deps.auth import CurrentUser, get_current_user
from opennotebook_api.deps.db import get_db
from opennotebook_api.main import create_app
from opennotebook_api.routers import account as account_router
from opennotebook_core.config import Settings
from opennotebook_core.models import (
    Base,
    Chunk,
    Job,
    LLMUsage,
    MediaItem,
    Notebook,
    Source,
    SummaryCache,
    UserSettings,
)
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest.mark.asyncio
async def test_account_purge_removes_only_owned_rows_and_files(tmp_path) -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)

    @event.listens_for(engine.sync_engine, "connect")
    def enable_foreign_keys(dbapi_connection, _record) -> None:
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as session:
        session.add_all(
            [
                Notebook(
                    id="owned-book",
                    user_id="owner",
                    title="Owned",
                    deleted_at=datetime.now(UTC),
                ),
                Notebook(id="other-book", user_id="other", title="Other"),
            ]
        )
        await session.flush()
        session.add_all(
            [
                Source(
                    id="owned-source",
                    notebook_id="owned-book",
                    user_id="owner",
                    name="owned.txt",
                    kind="text",
                    storage_key="owner/owned.txt",
                    status="ready",
                    progress=100,
                    extracted_text="owned",
                    metadata_json={},
                ),
                Source(
                    id="other-source",
                    notebook_id="other-book",
                    user_id="other",
                    name="other.txt",
                    kind="text",
                    storage_key="other/other.txt",
                    status="ready",
                    progress=100,
                    extracted_text="private",
                    metadata_json={},
                ),
            ]
        )
        await session.flush()
        session.add(
            Chunk(
                id="owned-vector",
                source_id="owned-source",
                notebook_id="owned-book",
                ordinal=0,
                text="owned",
                char_start=0,
                char_end=5,
                heading_path=[],
                embedding=[0.0] * 768,
                metadata_json={},
            )
        )
        session.add_all(
            [
                UserSettings(
                    user_id="owner",
                    provider="openrouter",
                    chat_model="x",
                    cheap_model="x",
                    fallback_model="",
                ),
                UserSettings(
                    user_id="other",
                    provider="openrouter",
                    chat_model="x",
                    cheap_model="x",
                    fallback_model="",
                ),
                Job(id="owned-job", user_id="owner", kind="ingest", status="queued"),
                Job(id="other-job", user_id="other", kind="ingest", status="queued"),
                LLMUsage(
                    id="owned-usage",
                    user_id="owner",
                    model_name="fixture",
                    input_tokens=1,
                    output_tokens=1,
                ),
                LLMUsage(
                    id="other-usage",
                    user_id="other",
                    model_name="fixture",
                    input_tokens=1,
                    output_tokens=1,
                ),
                SummaryCache(
                    cache_key="a" * 64,
                    user_id="owner",
                    summary="private",
                    topics=[],
                    questions=[],
                    model_name="fixture",
                ),
                SummaryCache(
                    cache_key="b" * 64,
                    user_id="other",
                    summary="private",
                    topics=[],
                    questions=[],
                    model_name="fixture",
                ),
            ]
        )
        session.add(
            MediaItem(
                id="owned-figure",
                source_id="owned-source",
                notebook_id="owned-book",
                storage_key="owner/figure.png",
                text_anchor="owned chart",
                embedding=[0.0] * 768,
                modality="image",
            )
        )
        await session.commit()

    (tmp_path / "owner").mkdir()
    (tmp_path / "other").mkdir()
    (tmp_path / "owner" / "owned.txt").write_text("owned")
    (tmp_path / "owner" / "figure.png").write_bytes(b"figure")
    (tmp_path / "other" / "other.txt").write_text("other")
    app = create_app(
        Settings(
            account_internal_token="private-test-token",
            storage_backend="local",
            storage_path=tmp_path,
        )
    )

    async def override_db() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    assert client.delete("/internal/accounts/owner/data").status_code == 401
    assert (
        client.delete(
            "/internal/accounts/owner/data", headers={"Authorization": "Bearer wrong"}
        ).status_code
        == 401
    )
    response = client.delete(
        "/internal/accounts/owner/data", headers={"Authorization": "Bearer private-test-token"}
    )
    assert response.status_code == 204
    assert not (tmp_path / "owner" / "owned.txt").exists()
    assert not (tmp_path / "owner" / "figure.png").exists()
    assert (tmp_path / "other" / "other.txt").read_text() == "other"
    async with factory() as session:
        assert await session.get(Notebook, "owned-book") is None
        assert await session.get(Notebook, "other-book") is not None
        assert await session.get(Chunk, "owned-vector") is None
        assert await session.get(Source, "owned-source") is None
        assert await session.get(Source, "other-source") is not None
        assert await session.get(UserSettings, "owner") is None
        assert await session.get(UserSettings, "other") is not None
        assert await session.get(Job, "owned-job") is None
        assert await session.get(Job, "other-job") is not None
        assert await session.get(LLMUsage, "owned-usage") is None
        assert await session.get(LLMUsage, "other-usage") is not None
        assert await session.get(SummaryCache, "a" * 64) is None
        assert await session.get(SummaryCache, "b" * 64) is not None
    await engine.dispose()


def test_internal_email_route_uses_configured_smtp_without_exposing_body(
    monkeypatch, caplog
) -> None:
    captured: list[object] = []

    def fake_send(_settings, message) -> None:
        captured.append(message)

    monkeypatch.setattr(account_router, "_send_smtp", fake_send)
    app = create_app(Settings(account_internal_token="private-test-token", smtp_host="mailpit"))
    response = TestClient(app).post(
        "/internal/email",
        headers={"Authorization": "Bearer private-test-token"},
        json={
            "to": "reader@example.test",
            "subject": "Verify",
            "text": "one-time-secret-reset-url",
        },
    )
    assert response.status_code == 202
    assert len(captured) == 1
    assert captured[0]["To"] == "reader@example.test"
    assert captured[0]["Subject"] == "Verify"
    assert "reader@example.test" not in caplog.text
    assert "one-time-secret-reset-url" not in caplog.text
    assert "private-test-token" not in caplog.text


@pytest.mark.asyncio
async def test_account_export_contains_only_signed_in_users_notebooks(tmp_path) -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        session.add_all(
            [
                Notebook(id="mine", user_id="owner", title="My notebook"),
                Notebook(id="theirs", user_id="other", title="Other notebook"),
            ]
        )
        await session.commit()
    app = create_app(Settings())

    async def override_db() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="owner")
    response = TestClient(app).get("/account/export.zip")
    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        names = archive.namelist()
        assert "notebooks/mine/notebook.json" in names
        assert all("theirs" not in name for name in names)
    await engine.dispose()
