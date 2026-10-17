from fastapi.testclient import TestClient
from opennotebook_core.config import Settings
from opennotebook_embed.main import create_app


def test_fake_health_and_ready() -> None:
    client = TestClient(create_app(Settings(embed_backend="fake")))
    assert client.get("/healthz").status_code == 200
    assert client.get("/readyz").status_code == 200


def test_fake_embed() -> None:
    client = TestClient(create_app(Settings(embed_backend="fake")))
    response = client.post("/embed", json={"texts": ["hello"], "kind": "query", "dim": 256})
    assert response.status_code == 200
    assert len(response.json()["vectors"][0]) == 256


def test_batch_limit() -> None:
    client = TestClient(create_app(Settings(embed_backend="fake", embed_batch_size=1)))
    assert (
        client.post(
            "/embed", json={"texts": ["a", "b"], "kind": "document", "dim": 128}
        ).status_code
        == 413
    )


def test_gemma_stub_not_ready() -> None:
    client = TestClient(create_app(Settings(embed_backend="gemma2")))
    assert client.get("/readyz").status_code == 503
    assert (
        client.post("/embed", json={"texts": ["a"], "kind": "query", "dim": 128}).status_code == 503
    )
