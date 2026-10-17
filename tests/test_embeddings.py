import math

import httpx
import pytest
from opennotebook_core.embeddings import FakeEmbedding, HttpEmbeddingProvider


@pytest.mark.asyncio
async def test_fake_deterministic() -> None:
    fake = FakeEmbedding()
    first = await fake.embed(["alpha"], "query")
    assert first == await fake.embed(["alpha"], "query")
    assert first != await fake.embed(["beta"], "query")
    assert first != await fake.embed(["alpha"], "document")


@pytest.mark.asyncio
@pytest.mark.parametrize("dim", [128, 256, 512, 768])
async def test_fake_dimension_and_norm(dim: int) -> None:
    vector = (await FakeEmbedding().embed(["text"], "document", dim))[0]
    assert len(vector) == dim
    assert math.isclose(math.sqrt(sum(x * x for x in vector)), 1, abs_tol=1e-9)


@pytest.mark.asyncio
async def test_fake_invalid_dimension() -> None:
    with pytest.raises(ValueError):
        await FakeEmbedding().embed(["text"], "query", 42)


@pytest.mark.asyncio
async def test_http_batches() -> None:
    requests: list[list[str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        data = __import__("json").loads(request.content)
        requests.append(data["texts"])
        return httpx.Response(200, json={"vectors": [[1.0] * data["dim"] for _ in data["texts"]]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        vectors = await HttpEmbeddingProvider("http://embed", batch_size=2, client=client).embed(
            ["a", "b", "c"], "query", 128
        )
    assert len(vectors) == 3
    assert requests == [["a", "b"], ["c"]]


@pytest.mark.asyncio
async def test_http_rejects_bad_dimension() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"vectors": [[1.0]]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError):
            await HttpEmbeddingProvider("http://embed", client=client).embed(["a"], "query", 128)
