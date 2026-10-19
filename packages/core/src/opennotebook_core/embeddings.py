import asyncio
import base64
import hashlib
import math
from typing import Literal, Protocol

import httpx

from opennotebook_core.config import Settings

Kind = Literal["query", "document"]


class EmbeddingProvider(Protocol):
    async def embed(self, texts: list[str], kind: Kind, dim: int) -> list[list[float]]: ...


class FakeEmbedding:
    def __init__(self, dim: int = 768):
        self.dim = dim

    async def embed(
        self, texts: list[str], kind: Kind, dim: int | None = None
    ) -> list[list[float]]:
        target_dim = dim or self.dim
        if target_dim not in {128, 256, 512, 768}:
            raise ValueError("unsupported embedding dimension")
        vectors: list[list[float]] = []
        for value in texts:
            seed = hashlib.sha256(f"{kind}:{value}".encode()).digest()
            vector = []
            for index in range(target_dim):
                digest = hashlib.sha256(seed + index.to_bytes(4, "big")).digest()
                vector.append((int.from_bytes(digest[:4], "big") / 2**32) * 2 - 1)
            norm = math.sqrt(sum(number * number for number in vector))
            vectors.append([number / norm for number in vector])
        return vectors


class HttpEmbeddingProvider:
    def __init__(
        self, base_url: str, batch_size: int = 32, client: httpx.AsyncClient | None = None
    ):
        self.base_url = base_url.rstrip("/")
        self.batch_size = batch_size
        self.client = client

    async def embed(self, texts: list[str], kind: Kind, dim: int) -> list[list[float]]:
        vectors: list[list[float]] = []
        client = self.client or httpx.AsyncClient(timeout=httpx.Timeout(120, connect=5))
        try:
            for offset in range(0, len(texts), self.batch_size):
                batch = texts[offset : offset + self.batch_size]
                for attempt in range(3):
                    try:
                        response = await client.post(
                            f"{self.base_url}/embed",
                            json={"texts": batch, "kind": kind, "dim": dim},
                        )
                        if 400 <= response.status_code < 500 and response.status_code != 429:
                            response.raise_for_status()
                        response.raise_for_status()
                        result = response.json()["vectors"]
                        if len(result) != len(batch) or any(
                            len(v) != dim or not all(math.isfinite(value) for value in v)
                            for v in result
                        ):
                            raise ValueError("invalid embedding response dimensions")
                        vectors.extend(result)
                        break
                    except httpx.HTTPStatusError as exc:
                        if exc.response.status_code < 500 and exc.response.status_code != 429:
                            raise
                        if attempt == 2:
                            raise
                        await asyncio.sleep(2**attempt)
                    except (httpx.HTTPError, ValueError, KeyError):
                        if attempt == 2:
                            raise
                        await asyncio.sleep(2**attempt)
        finally:
            if self.client is None:
                await client.aclose()
        return vectors

    async def embed_images(
        self, images: list[bytes], anchors: list[str], dim: int
    ) -> list[list[float]]:
        if len(images) != len(anchors):
            raise ValueError("image and anchor batches must have the same length")
        vectors: list[list[float]] = []
        client = self.client or httpx.AsyncClient(timeout=httpx.Timeout(120, connect=5))
        try:
            for offset in range(0, len(images), min(16, self.batch_size)):
                batch_images = images[offset : offset + min(16, self.batch_size)]
                batch_anchors = anchors[offset : offset + min(16, self.batch_size)]
                payload = {
                    "items": [
                        {
                            "modality": "image",
                            "media_base64": base64.b64encode(image).decode("ascii"),
                            "text": anchor,
                        }
                        for image, anchor in zip(batch_images, batch_anchors, strict=True)
                    ],
                    "dim": dim,
                }
                for attempt in range(3):
                    try:
                        response = await client.post(f"{self.base_url}/embed-media", json=payload)
                        response.raise_for_status()
                        batch_vectors = response.json()["vectors"]
                        if len(batch_vectors) != len(batch_images) or any(
                            len(vector) != dim or not all(math.isfinite(value) for value in vector)
                            for vector in batch_vectors
                        ):
                            raise ValueError("invalid media embedding response")
                        vectors.extend(batch_vectors)
                        break
                    except (httpx.HTTPError, ValueError, KeyError):
                        if attempt == 2:
                            raise
                        await asyncio.sleep(2**attempt)
        finally:
            if self.client is None:
                await client.aclose()
        return vectors


def make_embedding(settings: Settings) -> EmbeddingProvider:
    if settings.embed_backend == "fake":
        return FakeEmbedding(settings.embed_dim)
    return HttpEmbeddingProvider(settings.embed_url, settings.embed_batch_size)
