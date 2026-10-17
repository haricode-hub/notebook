import asyncio
from typing import Literal

from fastapi import FastAPI, HTTPException
from opennotebook_core.config import Settings, get_settings
from opennotebook_core.embeddings import FakeEmbedding
from pydantic import BaseModel, Field


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=128)
    kind: Literal["query", "document"]
    dim: Literal[128, 256, 512, 768] = 768


class EmbedResponse(BaseModel):
    vectors: list[list[float]]
    model: str
    dim: int


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="OpenNotebook Embedding Service", version="0.1.0")
    semaphore = asyncio.Semaphore(settings.embed_concurrency)
    fake = FakeEmbedding(settings.embed_dim)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/readyz")
    async def readyz() -> dict[str, str]:
        if settings.embed_backend == "fake":
            return {"status": "ok", "backend": "fake"}
        # LEVEL 2: load google/embeddinggemma-2 once, warm it, then report ready.
        raise HTTPException(status_code=503, detail="gemma2 backend is scheduled for Level 2")

    @app.post("/embed", response_model=EmbedResponse)
    async def embed(body: EmbedRequest) -> EmbedResponse:
        if len(body.texts) > settings.embed_batch_size:
            raise HTTPException(status_code=413, detail="embedding batch too large")
        if settings.embed_backend != "fake":
            # LEVEL 2: implement EmbeddingGemma 2 with exact task prefixes and BF16/FP32.
            raise HTTPException(status_code=503, detail="gemma2 backend is scheduled for Level 2")
        async with semaphore:
            vectors = await fake.embed(body.texts, body.kind, body.dim)
        return EmbedResponse(vectors=vectors, model="fake", dim=body.dim)

    return app


app = create_app()
