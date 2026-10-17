from fastapi.testclient import TestClient
from opennotebook_api.main import create_app
from opennotebook_core.config import Settings


async def up(settings: Settings) -> bool:
    return True


async def down(settings: Settings) -> bool:
    return False


def test_health_and_ready_up() -> None:
    client = TestClient(create_app(Settings(), {"db": up, "redis": up, "embed": up}))
    assert client.get("/healthz").json() == {"status": "ok"}
    response = client.get("/readyz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "ok", "redis": "ok", "embed": "ok"}
    assert response.headers["x-request-id"]


def test_ready_down_when_redis_stops() -> None:
    client = TestClient(create_app(Settings(), {"db": up, "redis": down, "embed": up}))
    response = client.get("/readyz")
    assert response.status_code == 503
    assert response.json()["redis"] == "down"


def test_cors_is_limited() -> None:
    client = TestClient(
        create_app(
            Settings(web_origin="http://localhost:3000"),
            {"db": up, "redis": up, "embed": up},
        )
    )
    good = client.options(
        "/readyz",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    bad = client.options(
        "/readyz", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"}
    )
    assert good.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert bad.status_code == 400


def test_body_limit_and_error_schema() -> None:
    client = TestClient(create_app(Settings(upload_max_mb=1), {"db": up, "redis": up, "embed": up}))
    response = client.post("/nothing", headers={"content-length": "1048577"})
    assert response.status_code == 413
    assert response.json()["code"] == "body_too_large"
    assert response.json()["request_id"] == response.headers["x-request-id"]
