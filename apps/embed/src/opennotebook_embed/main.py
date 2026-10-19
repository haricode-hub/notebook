import asyncio
import base64
import binascii
import math
import os
import tempfile
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from io import BytesIO
from typing import Any, Literal

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


class MediaItemRequest(BaseModel):
    modality: Literal["image", "audio"] = "image"
    media_base64: str = Field(min_length=16, max_length=24_000_000)
    text: str = Field(default="", max_length=4000)


class MediaEmbedRequest(BaseModel):
    items: list[MediaItemRequest] = Field(min_length=1, max_length=16)
    dim: Literal[128, 256, 512, 768] = 768


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    model: Any = None
    load_error: str | None = None

    def load_model() -> Any:
        import os

        import torch
        from sentence_transformers import SentenceTransformer

        torch.set_num_threads(min(4, os.cpu_count() or 1))
        torch.set_num_interop_threads(1)
        config_kwargs: dict[str, None] = {}
        if not settings.multimodal_enabled or not settings.multimodal_image_enabled:
            config_kwargs["vision_config"] = None
        if not settings.multimodal_enabled or not settings.multimodal_audio_enabled:
            config_kwargs["audio_config"] = None
        loaded = SentenceTransformer(
            "google/embeddinggemma-2",
            device="cpu",
            config_kwargs=config_kwargs,
            model_kwargs={"torch_dtype": torch.float32},
        )
        loaded.encode(
            ["warmup"],
            prompt_name="Document",
            truncate_dim=settings.embed_dim,
            normalize_embeddings=True,
        )
        return loaded

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        nonlocal model, load_error
        if settings.embed_backend == "gemma2":
            try:
                model = await asyncio.to_thread(load_model)
            except Exception as exc:
                load_error = str(exc)
                raise
        yield

    app = FastAPI(title="OpenNotebook Embedding Service", version="0.1.0", lifespan=lifespan)
    semaphore = asyncio.Semaphore(settings.embed_concurrency)
    fake = FakeEmbedding(settings.embed_dim)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/readyz")
    async def readyz() -> dict[str, str]:
        if settings.embed_backend == "fake":
            return {"status": "ok", "backend": "fake"}
        if model is None:
            raise HTTPException(status_code=503, detail=load_error or "Embedding model is loading")
        return {"status": "ok", "backend": "gemma2"}

    @app.post("/embed", response_model=EmbedResponse)
    async def embed(body: EmbedRequest) -> EmbedResponse:
        if len(body.texts) > settings.embed_batch_size:
            raise HTTPException(status_code=413, detail="embedding batch too large")
        async with semaphore:
            if settings.embed_backend == "fake":
                vectors = await fake.embed(body.texts, body.kind, body.dim)
            else:
                if model is None:
                    raise HTTPException(status_code=503, detail="Embedding model is loading")
                prompt = "SearchQuery" if body.kind == "query" else "Document"
                encoded = await asyncio.to_thread(
                    model.encode,
                    body.texts,
                    prompt_name=prompt,
                    truncate_dim=body.dim,
                    normalize_embeddings=True,
                    batch_size=settings.embed_batch_size,
                )
                vectors = encoded.tolist()
            if any(
                len(v) != body.dim
                or not all(math.isfinite(x) for x in v)
                or abs(math.sqrt(sum(x * x for x in v)) - 1) > 0.001
                for v in vectors
            ):
                raise HTTPException(
                    status_code=502, detail="Embedding backend returned invalid vectors"
                )
        return EmbedResponse(
            vectors=vectors,
            model="fake" if settings.embed_backend == "fake" else "google/embeddinggemma-2",
            dim=body.dim,
        )

    @app.post("/embed-media", response_model=EmbedResponse)
    async def embed_media(body: MediaEmbedRequest) -> EmbedResponse:
        if not settings.multimodal_enabled or any(
            (item.modality == "image" and not settings.multimodal_image_enabled)
            or (item.modality == "audio" and not settings.multimodal_audio_enabled)
            for item in body.items
        ):
            raise HTTPException(status_code=404, detail="Multimodal embedding is disabled")
        if settings.embed_backend == "fake":
            raise HTTPException(status_code=501, detail="Fake backend does not embed media")
        temp_paths: list[str] = []
        try:
            from PIL import Image

            payloads = []
            for item in body.items:
                raw = base64.b64decode(item.media_base64, validate=True)
                if item.modality == "image":
                    image = Image.open(BytesIO(raw)).convert("RGB")
                    payloads.append({"image": image, "text": item.text})
                else:
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as audio_file:
                        audio_file.write(raw)
                        temp_paths.append(audio_file.name)
                    payloads.append({"audio": temp_paths[-1], "text": item.text})
        except (ValueError, binascii.Error, OSError) as exc:
            for path in temp_paths:
                os.unlink(path)
            raise HTTPException(status_code=422, detail="Invalid media payload") from exc
        if model is None:
            for path in temp_paths:
                os.unlink(path)
            raise HTTPException(status_code=503, detail="Embedding model is loading")
        async with semaphore:
            try:
                encoded = await asyncio.to_thread(
                    model.encode,
                    payloads,
                    prompt_name="Document",
                    truncate_dim=body.dim,
                    normalize_embeddings=True,
                    processing_kwargs={
                        "image": {"max_soft_tokens": settings.multimodal_image_max_soft_tokens}
                    },
                    batch_size=min(len(payloads), settings.embed_batch_size),
                )
                vectors = encoded.tolist()
            finally:
                for path in temp_paths:
                    os.unlink(path)
        if any(
            len(v) != body.dim
            or not all(math.isfinite(x) for x in v)
            or abs(math.sqrt(sum(x * x for x in v)) - 1) > 0.001
            for v in vectors
        ):
            raise HTTPException(
                status_code=502, detail="Embedding backend returned invalid vectors"
            )
        return EmbedResponse(vectors=vectors, model="google/embeddinggemma-2", dim=body.dim)

    return app


app = create_app()
