"""Measure real CPU extraction and EmbeddingGemma throughput on a dense 100-page PDF slice."""

from __future__ import annotations

import io
import json
import os
import time
from pathlib import Path

import psutil
from opennotebook_core.chunking import chunk_document
from opennotebook_core.extractors import PdfExtractor
from pypdf import PdfReader, PdfWriter


def main() -> None:
    os.environ["EMBED_BACKEND"] = "gemma2"
    import torch
    from sentence_transformers import SentenceTransformer

    torch.set_num_threads(min(4, os.cpu_count() or 1))
    torch.set_num_interop_threads(1)
    manifest = json.loads((Path(__file__).parent / "docs/manifest.json").read_text())
    source = next(item for item in manifest if item["id"] == "nist-ot")
    reader = PdfReader(Path(__file__).parent / "docs" / source["filename"])
    writer = PdfWriter()
    for page in reader.pages[:100]:
        writer.add_page(page)
    dense_pdf = io.BytesIO()
    writer.write(dense_pdf)

    started = time.perf_counter()
    document = PdfExtractor().extract(dense_pdf.getvalue())
    extraction_seconds = time.perf_counter() - started
    started = time.perf_counter()
    spans = chunk_document(document)
    chunking_seconds = time.perf_counter() - started

    started = time.perf_counter()
    model = SentenceTransformer(
        "google/embeddinggemma-2",
        device="cpu",
        config_kwargs={"vision_config": None, "audio_config": None},
        model_kwargs={"torch_dtype": torch.float32},
    )
    model_load_seconds = time.perf_counter() - started
    start = time.perf_counter()
    vectors = model.encode(
        [span.text for span in spans],
        batch_size=16,
        prompt_name="Document",
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=True,
    )
    embedding_seconds = time.perf_counter() - start
    rss_mib = psutil.Process().memory_info().rss / (1024 * 1024)
    result = {
                "pdf": source["filename"],
                "pages": document.page_count,
                "characters": len(document.text),
                "chunks": len(spans),
                "dimension": int(vectors.shape[1]),
                "model": "google/embeddinggemma-2 FP32 CPU",
                "model_load_seconds": round(model_load_seconds, 2),
                "extract_seconds": round(extraction_seconds, 2),
                "chunk_seconds": round(chunking_seconds, 2),
                "embedding_seconds": round(embedding_seconds, 2),
                "total_after_model_load_seconds": round(
                    extraction_seconds + chunking_seconds + embedding_seconds, 2
                ),
                "embedding_chunks_per_second": round(len(spans) / embedding_seconds, 2),
                "peak_rss_mib": round(rss_mib, 1),
                "runner": "Windows CPU",
    }
    result_path = Path(__file__).parent / "results" / "pdf-benchmark-latest.json"
    result_path.parent.mkdir(exist_ok=True)
    result_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    print(f"Benchmark result: {result_path}")


if __name__ == "__main__":
    main()
