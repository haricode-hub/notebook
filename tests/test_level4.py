"""Owned source content and short-lived original file access."""

from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from opennotebook_api.routers import sources as sources_router
from opennotebook_core.models import Chunk, Source
from opennotebook_core.storage import MemoryStorage, verify_file_token
from sqlalchemy import select
from test_level1 import auth

pytest_plugins = ["test_level1"]


@pytest.mark.asyncio
async def test_content_rename_and_signed_pdf_access(
    level1_app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    app, keys, _, _ = level1_app
    storage = MemoryStorage()
    monkeypatch.setattr(sources_router, "make_storage", lambda _: storage)
    await storage.put("owner/book/source.pdf", b"%PDF-1.4 test")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        owner = auth(keys.token("owner"))
        other = auth(keys.token("other"))
        created = await client.post("/notebooks", headers=owner, json={"title": "Citations"})
        notebook_id = created.json()["id"]
        path = f"/notebooks/{notebook_id}/sources/source-1"
        async with app.state.session_factory() as session:
            session.add(
                Source(
                    id="source-1",
                    notebook_id=notebook_id,
                    user_id="owner",
                    name="paper.pdf",
                    kind="pdf",
                    storage_key="owner/book/source.pdf",
                    status="ready",
                    progress=100,
                    extracted_text="The cited sentence.",
                    page_count=1,
                    metadata_json={},
                )
            )
            session.add(
                Chunk(
                    id="chunk-1",
                    source_id="source-1",
                    notebook_id=notebook_id,
                    ordinal=0,
                    text="The cited sentence.",
                    page_start=1,
                    page_end=1,
                    char_start=0,
                    char_end=19,
                    heading_path=[],
                    embedding=[1.0] + [0.0] * 767,
                    metadata_json={},
                )
            )
            await session.commit()

        assert (await client.get(path + "/content", headers=other)).status_code == 404
        content = await client.get(path + "/content", headers=owner)
        assert content.status_code == 200
        body = content.json()
        chunk = body["chunks"][0]
        assert body["text"][chunk["char_start"] : chunk["char_end"]] == "The cited sentence."
        assert body["chunks"][0]["page_start"] == 1
        file_url = body["file_url"]
        assert file_url.startswith("/files/")
        assert (await client.get(file_url, headers=owner)).content == b"%PDF-1.4 test"
        assert (await client.get(file_url, headers=other)).status_code == 403
        assert (await client.get(file_url + "tampered", headers=owner)).status_code == 403
        assert (await client.get(file_url)).status_code == 401
        expired_url = storage.url(
            "owner/book/source.pdf", user_id="owner", source_id="source-1",
            expires_at=int(datetime.now(UTC).timestamp()) - 1,
            signing_key=app.state.settings.settings_encryption_key,
        )
        assert (await client.get(expired_url, headers=owner)).status_code == 403
        renamed = await client.patch(path, headers=owner, json={"name": "Renamed paper"})
        assert renamed.json()["name"] == "Renamed paper"
        selected = await client.patch(path, headers=owner, json={"selected": False})
        assert selected.json()["selected"] is False
        assert (await client.patch(path, headers=other, json={"name": "Stolen"})).status_code == 404
        async with app.state.session_factory() as session:
            source = await session.scalar(select(Source).where(Source.id == "source-1"))
            assert source is not None and source.name == "Renamed paper"


def test_signed_url_expiry_and_identity() -> None:
    storage = MemoryStorage()
    expired = storage.url(
        "file.pdf",
        user_id="alice",
        source_id="source",
        expires_at=int(datetime.now(UTC).timestamp()) - 1,
        signing_key="secret",
    )
    with pytest.raises(ValueError):
        verify_file_token(expired.removeprefix("/files/"), user_id="alice", signing_key="secret")
    current = storage.url(
        "file.pdf",
        user_id="alice",
        source_id="source",
        expires_at=int(datetime.now(UTC).timestamp()) + 60,
        signing_key="secret",
    )
    with pytest.raises(ValueError):
        verify_file_token(current.removeprefix("/files/"), user_id="bob", signing_key="secret")
