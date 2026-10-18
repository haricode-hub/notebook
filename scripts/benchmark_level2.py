"""Run the real CPU model through a 100-page PDF ingestion job.

Run with: uv run --frozen --all-packages python scripts/benchmark_level2.py
"""

import asyncio
import json
import threading
import time
from io import BytesIO
from typing import cast

import numpy as np
import psutil  # type: ignore[import-untyped]
import torch
from opennotebook_core.config import Settings
from opennotebook_core.embeddings import Kind
from opennotebook_core.models import Base, Chunk, Job, Notebook, Source
from opennotebook_core.storage import MemoryStorage
from opennotebook_worker.main import ingest_source
from reportlab.pdfgen import canvas  # type: ignore[import-untyped]
from sentence_transformers import SentenceTransformer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


def fixture_pdf() -> bytes:
    buffer = BytesIO()
    document = canvas.Canvas(buffer)
    for page in range(100):
        document.setFont("Helvetica", 10)
        for line in range(12):
            document.drawString(
                50,
                780 - line * 20,
                f"Page {page + 1}, line {line + 1}. Research notes explain source grounding, "
                "citation offsets, retrieval, model behavior, and reproducible study methods.",
            )
        document.showPage()
    document.save()
    return buffer.getvalue()


class RealEmbedding:
    def __init__(self, model: SentenceTransformer):
        self.model = model

    async def embed(self, texts: list[str], kind: Kind, dim: int) -> list[list[float]]:
        prompt = "SearchQuery" if kind == "query" else "Document"
        encoded = await asyncio.to_thread(
            self.model.encode,
            texts,
            prompt_name=prompt,
            batch_size=8,
            truncate_dim=dim,
            normalize_embeddings=True,
        )
        return cast(list[list[float]], encoded.tolist())


class NullRedis:
    async def publish(self, _: str, __: str) -> int:
        return 1


async def benchmark() -> dict[str, object]:
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    model = await asyncio.to_thread(
        SentenceTransformer,
        "google/embeddinggemma-2",
        device="cpu",
        config_kwargs={"vision_config": None, "audio_config": None},
        model_kwargs={"torch_dtype": torch.float32},
    )
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        storage = MemoryStorage()
        await storage.put("benchmark.pdf", fixture_pdf())
        async with factory() as session:
            session.add(
                Notebook(
                    id="benchmark", user_id="benchmark", title="Benchmark", response_length="medium"
                )
            )
            session.add(
                Source(
                    id="benchmark-source",
                    notebook_id="benchmark",
                    user_id="benchmark",
                    name="benchmark.pdf",
                    kind="pdf",
                    storage_key="benchmark.pdf",
                    status="queued",
                    progress=0,
                    metadata_json={},
                )
            )
            session.add(
                Job(id="benchmark-job", user_id="benchmark", kind="ingest_source", status="queued")
            )
            await session.commit()
        context = {
            "session_factory": factory,
            "settings": Settings(embed_backend="gemma2", storage_backend="memory"),
            "storage": storage,
            "embedding": RealEmbedding(model),
            "redis": NullRedis(),
        }
        await ingest_source(context, "benchmark-source", "benchmark-job")
        async with factory() as session:
            source = await session.get(Source, "benchmark-source")
            chunks = list(
                (
                    await session.scalars(
                        select(Chunk).where(Chunk.source_id == "benchmark-source")
                    )
                ).all()
            )
            assert source is not None
            vectors = np.array([chunk.embedding for chunk in chunks])
            extracted_text = source.extracted_text or ""
            return {
                "pages": source.page_count,
                "status": source.status,
                "error": source.error,
                "chunks": len(chunks),
                "offsets_exact": bool(extracted_text)
                and all(
                    extracted_text[chunk.char_start : chunk.char_end] == chunk.text
                    for chunk in chunks
                ),
                "all_finite": bool(np.isfinite(vectors).all()),
                "norm_within_1e-3": bool(
                    np.allclose(np.linalg.norm(vectors, axis=1), 1, atol=0.001)
                ),
            }
    finally:
        await engine.dispose()


def main() -> None:
    started = time.perf_counter()
    stop = threading.Event()
    peak = [0]
    process = psutil.Process()

    def sample() -> None:
        while not stop.wait(0.1):
            peak[0] = max(peak[0], process.memory_info().rss)

    sampler = threading.Thread(target=sample, daemon=True)
    sampler.start()
    try:
        result = asyncio.run(benchmark())
        result["seconds"] = round(time.perf_counter() - started, 1)
        result["peak_rss_gib"] = round(max(peak[0], process.memory_info().rss) / 1024**3, 2)
        print(json.dumps(result))
    finally:
        stop.set()
        sampler.join()


if __name__ == "__main__":
    main()
