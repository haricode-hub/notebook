import base64
import json
import time
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import jwt
import litellm
import pytest
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from fastapi.testclient import TestClient
from opennotebook_api.main import create_app
from opennotebook_api.routers.settings import read_keys
from opennotebook_core.config import Settings
from opennotebook_core.llm import make_llm
from opennotebook_core.models import Base, UserSettings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


class Keys:
    def __init__(self) -> None:
        self.private: dict[str, Ed25519PrivateKey] = {}

    def add(self, kid: str) -> None:
        self.private[kid] = Ed25519PrivateKey.generate()

    def jwks(self) -> dict[str, Any]:
        return {
            "keys": [
                {
                    "kid": kid,
                    "kty": "OKP",
                    "crv": "Ed25519",
                    "alg": "EdDSA",
                    "use": "sig",
                    "x": b64(key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)),
                }
                for kid, key in self.private.items()
            ]
        }

    def token(self, user: str = "user-a", kid: str = "first", **overrides: Any) -> str:
        claims = {
            "sub": user,
            "role": "user",
            "aud": "opennotebook-api",
            "iss": "http://localhost:3000",
            "exp": datetime.now(UTC) + timedelta(minutes=10),
            "iat": datetime.now(UTC),
            **overrides,
        }
        return jwt.encode(claims, self.private[kid], algorithm="EdDSA", headers={"kid": kid})


@pytest.fixture
async def level1_app():  # type: ignore[no-untyped-def]
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    settings = Settings(
        settings_encryption_key=Fernet.generate_key().decode(),
        default_chat_model="default-chat",
        default_cheap_model="default-cheap",
        openrouter_api_key="server-openrouter-key",
        embed_backend="fake",
    )
    app = create_app(settings, {})
    app.state.session_factory = async_sessionmaker(engine, expire_on_commit=False)
    keys = Keys()
    keys.add("first")
    downloads: list[float] = []

    async def download() -> dict[str, Any]:
        downloads.append(time.monotonic())
        return keys.jwks()

    app.state.jwks_verifier._download = download
    yield app, keys, downloads, engine
    await engine.dispose()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_jwt_valid_invalid_and_rotation(level1_app: Any) -> None:
    app, keys, downloads, _ = level1_app
    client = TestClient(app)
    valid = keys.token()
    assert client.get("/notebooks", headers=auth(valid)).status_code == 200
    invalid = [
        {},
        auth("malformed"),
        auth(keys.token(exp=datetime.now(UTC) - timedelta(minutes=1))),
        auth(keys.token(aud="wrong")),
        auth(keys.token(iss="https://wrong.example")),
        auth(valid[:-2] + "xx"),
    ]
    unknown = keys.token(kid="first")
    header, payload, signature = unknown.split(".")
    header_data = json.loads(base64.urlsafe_b64decode(header + "=" * (-len(header) % 4)))
    header_data["kid"] = "missing"
    unknown = f"{b64(json.dumps(header_data).encode())}.{payload}.{signature}"
    invalid.append(auth(unknown))
    for headers in invalid:
        response = client.get("/notebooks", headers=headers)
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"
    assert len(downloads) >= 2  # unknown kid forces refresh despite cached JWKS
    keys.add("second")
    assert client.get("/notebooks", headers=auth(keys.token(kid="second"))).status_code == 200


def test_notebook_ownership_isolation(level1_app: Any) -> None:
    app, keys, _, _ = level1_app
    client = TestClient(app)
    owner = auth(keys.token("user-a"))
    other = auth(keys.token("user-b"))
    created = client.post("/notebooks", headers=owner, json={"title": "Private book"})
    assert created.status_code == 201
    book_id = created.json()["id"]
    assert [book["id"] for book in client.get("/notebooks", headers=owner).json()] == [book_id]
    assert client.get("/notebooks", headers=other).json() == []
    for method in ("get", "patch", "delete"):
        response = getattr(client, method)(
            f"/notebooks/{book_id}",
            headers=other,
            **({"json": {"title": "Stolen"}} if method == "patch" else {}),
        )
        assert response.status_code == 404
    assert client.get(f"/notebooks/{book_id}", headers=owner).status_code == 200


@pytest.mark.asyncio
async def test_settings_encrypts_keys_and_switches_provider(level1_app: Any) -> None:
    app, keys, _, engine = level1_app
    client = TestClient(app)
    headers = auth(keys.token())
    defaults = client.get("/settings", headers=headers).json()
    assert defaults["provider"] == "openrouter"
    assert defaults["using_server_key"] is True
    response = client.put(
        "/settings", headers=headers,
        json={"provider": "gemini", "chat_model": "chosen-model", "api_key": "gemini-secret"},
    )
    assert response.status_code == 200
    assert response.json()["provider"] == "gemini"
    async with async_sessionmaker(engine)() as session:
        row = (await session.execute(select(UserSettings))).scalar_one()
        assert "gemini-secret" not in (row.encrypted_keys or "")
        assert read_keys(row, app.state.settings) == {"gemini": "gemini-secret"}

    observed: list[tuple[str, str]] = []

    class FakeLLM:
        async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
            yield "OK"

    class FakeEmbedding:
        async def embed(self, texts: list[str], kind: str, dim: int) -> list[list[float]]:
            return [[0.0] * dim]

    def fake_llm(settings: Settings) -> FakeLLM:
        observed.append((settings.llm_provider, settings.default_chat_model))
        return FakeLLM()

    app.state.llm_factory = fake_llm
    app.state.embedding_factory = lambda config: FakeEmbedding()
    assert client.post("/settings/test-connection", headers=headers).status_code == 200
    client.put(
        "/settings", headers=headers,
        json={"provider": "openrouter", "chat_model": "another-model"},
    )
    assert client.post("/settings/test-connection", headers=headers).status_code == 200
    assert observed == [("gemini", "chosen-model"), ("openrouter", "another-model")]


def test_connection_errors_and_live_model_catalog(level1_app: Any) -> None:
    app, keys, _, _ = level1_app
    client = TestClient(app)
    headers = auth(keys.token())
    client.put(
        "/settings", headers=headers,
        json={"provider": "anthropic", "chat_model": "selected"},
    )
    missing = client.post("/settings/test-connection", headers=headers)
    assert missing.status_code == 400
    assert "key" in missing.json()["message"].lower()

    class BrokenLLM:
        async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
            raise RuntimeError("upstream rejected secret")
            yield ""  # pragma: no cover

    app.state.llm_factory = lambda config: BrokenLLM()
    client.put("/settings", headers=headers, json={"api_key": "bad-key"})
    failed = client.post("/settings/test-connection", headers=headers)
    assert failed.status_code == 400
    assert "Check the API key" in failed.json()["message"]
    assert "bad-key" not in failed.text

    async def catalog(provider: str, key: str, url: str) -> list[Any]:
        from opennotebook_api.routers.settings import ModelOption

        assert provider == "openrouter"
        return [ModelOption(id="vendor/live-model", name="Live Model")]

    app.state.model_catalog.list_models = catalog
    response = client.get("/settings/models?provider=openrouter", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"models": [{"id": "vendor/live-model", "name": "Live Model"}]}


def test_settings_switch_changes_litellm_route(
    level1_app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    app, keys, _, _ = level1_app
    client = TestClient(app)
    headers = auth(keys.token())
    observed: list[tuple[str, str | None]] = []

    async def fake_completion(**kwargs: Any) -> AsyncIterator[Any]:
        observed.append((kwargs["model"], kwargs.get("api_key")))

        async def chunks() -> AsyncIterator[Any]:
            yield SimpleNamespace(
                choices=[SimpleNamespace(delta=SimpleNamespace(content="OK"))]
            )

        return chunks()

    monkeypatch.setattr(litellm, "acompletion", fake_completion)
    app.state.llm_factory = make_llm
    app.state.embedding_factory = lambda config: SimpleNamespace(
        embed=lambda texts, kind, dim: fake_embed(dim)
    )
    client.put(
        "/settings", headers=headers,
        json={"provider": "gemini", "chat_model": "model-g", "api_key": "key-g"},
    )
    assert client.post("/settings/test-connection", headers=headers).status_code == 200
    client.put(
        "/settings", headers=headers,
        json={"provider": "openrouter", "chat_model": "vendor/model-o"},
    )
    assert client.post("/settings/test-connection", headers=headers).status_code == 200
    assert observed == [
        ("gemini/model-g", "key-g"),
        ("openrouter/vendor/model-o", "server-openrouter-key"),
    ]


async def fake_embed(dim: int) -> list[list[float]]:
    return [[0.0] * dim]
