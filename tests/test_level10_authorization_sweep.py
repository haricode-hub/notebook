import re
from typing import Any

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from opennotebook_api.deps.auth import CurrentUser, get_current_user
from opennotebook_api.deps.db import get_db
from opennotebook_api.main import create_app
from opennotebook_api.routers.sources import _source_capacity
from opennotebook_core.config import Settings
from opennotebook_core.models import Base, Notebook, Source
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

PUBLIC_PATHS = {"/healthz", "/readyz", "/public/shares/{token}"}


def _path(path: str) -> str:
    return re.sub(r"\{[^}]+\}", "fixture-id", path)


def test_openapi_authorization_sweep_requires_bearer_on_every_private_route() -> None:
    app = create_app(
        Settings(llm_provider="fake"),
        checks={
            "db": lambda _settings: _ok(),
            "redis": lambda _settings: _ok(),
            "embed": lambda _settings: _ok(),
        },
    )
    client = TestClient(app)
    openapi = app.openapi()
    failures: list[str] = []
    for route, operations in openapi["paths"].items():
        if route in PUBLIC_PATHS:
            continue
        for method, operation in operations.items():
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            path = _path(route)
            params: dict[str, str] = {}
            for parameter in operation.get("parameters", []):
                if parameter.get("in") == "query" and parameter.get("required"):
                    name = parameter["name"]
                    params[name] = "8" if name == "limit" else "test-query"
            body_info = operation.get("requestBody", {})
            body_type = next(iter(body_info.get("content", {})), "")
            options: dict[str, Any] = {"params": params}
            if body_info.get("required"):
                if "multipart/form-data" in body_type:
                    options["files"] = {"file": ("fixture.txt", b"fixture", "text/plain")}
                elif "application/json" in body_type:
                    options["json"] = {}
            response = client.request(method.upper(), path, **options)
            if response.status_code != 401 or response.headers.get("www-authenticate") != "Bearer":
                failures.append(f"{method.upper()} {route}: {response.status_code}")
    assert not failures, (
        "Unauthenticated private routes did not return Bearer 401:\n" + "\n".join(failures)
    )


async def _ok() -> bool:
    return True


def test_api_security_headers_are_present() -> None:
    client = TestClient(create_app(Settings(llm_provider="fake")))
    response = client.get("/healthz")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


def test_non_admin_cannot_reach_admin_endpoint() -> None:
    app = create_app(Settings(llm_provider="fake"))
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="regular", role="user")
    app.dependency_overrides[get_db] = lambda: None
    response = TestClient(app).get("/admin/overview")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_per_user_source_quota_is_enforced_across_notebooks() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        db.add_all(
            [
                Notebook(id="quota-book", user_id="quota-user", title="Quota"),
                Source(
                    id="quota-source",
                    notebook_id="quota-book",
                    user_id="quota-user",
                    name="fixture",
                    kind="text",
                    status="ready",
                    progress=100,
                    metadata_json={},
                ),
            ]
        )
        await db.commit()
        with pytest.raises(HTTPException) as error:
            await _source_capacity(db, "quota-book", user_limit=1)
        assert error.value.status_code == 429
    await engine.dispose()
