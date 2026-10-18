# Level 2 acceptance report

## Configuration and compatibility

- ADR-005 records the official EmbeddingGemma 2 model card findings and the text-only FP32 CPU configuration. `uv sync --frozen --all-packages` and import checks passed on Python 3.13.5. The Docker image uses Python 3.13.16.
- Default embeddings use `google/embeddinggemma-2`, 768 dimensions, document/query task prompts, batch size 8, and a persistent model cache. The fake backend remains available for deterministic tests.
- PDF/DOCX/PPTX extraction uses focused Python libraries instead of Docling; scanned PDFs still need OCR. This deviation is recorded in ADR-005.

## 100-page real-model benchmark

`scripts/benchmark_level2.py` generated a 100-page text PDF with approximately 240 words per page, then ran the actual persisted `ingest_source` worker path using the real text-only model on a Windows CPU host. The source reached `ready` in **213.4 seconds** with **54 chunks** and **2.64 GiB peak process RSS**. Every stored chunk sliced exactly from the canonical extracted text; vectors were finite and normalized within 1e-3. This passes the four-minute and four-GiB targets for this fixture. Runtime depends on text density and CPU speed; a denser 100-page fixture exceeded four minutes in a direct encode benchmark.

## Verification

- Python: **52 passed**, one optional slow test skipped in the default suite; **89.55% coverage** across storage, embedding, and queue contracts. The local slow real-model ranking test also passed.
- Python static checks: Ruff and mypy pass. Web: ESLint, TypeScript, two Vitest tests, and the production Next.js build pass.
- Final Compose images for web, API, worker, and embed built successfully. All six runtime services are healthy, the Better Auth migration completed, and Alembic reports `0003 (head)`.
- Playwright: **5 passed** against the rebuilt Compose stack. The Level 2 journeys upload a PDF to `ready`, delete it, and verify SSE reconnect after a dropped connection and an expired token response. The Level 1 sign-up, workspace, theme, sign-out, protected-route, and rate-limit journeys still pass. The PDF journey asserts no browser console errors.
- A two-user worker integration test confirms both ingestions reach `ready` while embedding calls overlap. Unit and integration tests cover all required source kinds, exact chunk offsets, document extraction, retries, SSRF cases, ownership, source deletion, model safety, reindexing, and failure/retry idempotency.

The Windows shell does not provide `make`, so its constituent commands were run directly. A sandbox-owned old `.pytest-tmp` directory denied access; the passing test run selected `.uv-cache/pytest-tmp` as the temporary directory.
