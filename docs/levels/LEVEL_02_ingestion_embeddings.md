# LEVEL 2: Source Ingestion and EmbeddingGemma 2

Prerequisite: `AGENTS.md`; Levels 0-1 complete.

## Feature name
Add sources (files, text, URLs) and turn them into searchable chunks embedded with EmbeddingGemma 2.

## Objectives and goals
- Reliable ingestion for PDF, DOCX, PPTX, TXT, MD, pasted text, and website URLs.
- Chunks carry exact positions (page, offsets, headings) for Level 4 highlighting.
- Real local embeddings with EmbeddingGemma 2 through the `embed` service.
- Live progress, clear failures, working retry.

## Scope
- **Embed service (real):** implement `EMBED_BACKEND=gemma2` using sentence-transformers (`google/embeddinggemma-2`), BF16/FP32 only (never FP16), L2-normalized output, correct query/document task prefixes from the model card, Matryoshka truncation to `EMBED_DIM` (default 768) with re-normalization, batching with size cap, concurrency cap, model warmup, model cache volume, `/readyz` only after load. Start with the text-only/lightest loadable configuration; keep vision/audio encoders off until Level 9.
- Endpoints: upload (multipart), add URL, add text, list, delete, retry, per-source status.
- Worker pipeline: store file, extract (Docling for PDF/DOCX/PPTX, MarkItDown fallback; trafilatura for URLs; direct read for txt/md), clean, chunk (structure-aware, 500-800 tokens, about 12% overlap, sentence-safe; stays well under the 8,192-token embed context), embed in batches, write chunks with vector + tsvector.
- Dimension/model safety: store `embedding_model` and `embedding_dim` on each source; refuse to mix in one notebook; add a "re-index notebook" job.
- SSE `/notebooks/{id}/events` (fetch-based client, JWT header, reconnect with a fresh token); events carried from worker to API via Redis pub/sub.
- UI: add-source dialog (drag/drop, URL, paste), source cards with status chips/progress, delete, retry, per-file errors; uploads go browser to FastAPI directly with progress.
- Security: SSRF protection (block private/loopback/link-local, limit redirects, size/time caps), MIME sniffing + extension allowlist, filename sanitization, limits (50 sources/notebook, 50 MB/file, 500 pages).

## Agent Prompt
```
Read AGENTS.md and this file. Levels 0-1 are done. Execute LEVEL 2 only.
FIRST use Context7/web to read the official EmbeddingGemma 2 model card and sentence-transformers docs: exact model id, how to load the lightest text-only configuration, the query/document task prefixes, supported Matryoshka dims, max tokens, dtype guidance, minimum transformers version. Record findings and the chosen configuration in docs/DECISIONS.md (ADR-005). Check that every new dependency installs on Python 3.13.
Implement the embed service gemma2 backend with a model cache volume and warmup; keep the fake backend for tests. Implement HttpEmbeddingProvider batching, retries, and kind=query|document.
Create tables sources and chunks (chunks: id, source_id, notebook_id, ordinal, text, page_start, page_end, char_start, char_end, heading_path, embedding vector(EMBED_DIM), tsv tsvector, metadata_json). HNSW on embedding (cosine), GIN on tsv. Store embedding_model + embedding_dim per source; enforce no mixing; implement reindex job.
Implement extractors behind an Extractor interface (Pdf, Docx, Pptx, Text, Web) returning structured blocks (page, heading path, char offsets). Implement the Chunker as a pure function with property tests (never mid-sentence, overlap, offsets slice back to the original text exactly).
Worker job ingest_source with stages (fetching, extracting, chunking, embedding, indexing, ready), status/progress updates, Redis pub/sub events, SSE endpoint with ownership check. Jobs must be idempotent (re-run replaces that source's chunks in one transaction).
SSRF-safe fetcher with tests (127.0.0.1, 10.x, 169.254.169.254, redirect-to-private, oversized, slow response).
Web: add-source dialog, sources list with live status via fetch-based SSE with reconnect and token refresh, delete, retry, upload progress.
Tests: chunker properties; each extractor on fixtures; embedding sanity (similar sentences score higher than unrelated ones with the real model, marked slow and run in CI nightly or locally; Fake in default CI); ingestion integration with FakeEmbedding; SSRF suite; failure test (corrupt PDF => failed with readable message; retry works); Playwright e2e: upload a PDF and watch it become ready.
Output <promise>L2_COMPLETE</promise> when acceptance tests pass.
```

## Task checklist
- [ ] ADR-005 (model card findings)
- [ ] embed service gemma2 backend + cache + warmup + readiness
- [ ] HttpEmbeddingProvider (batching, kinds, retries)
- [ ] sources/chunks schema + indexes + reindex job
- [ ] Extractor interface + 5 extractors
- [ ] Chunker + property tests
- [ ] ingest job + idempotency + progress events
- [ ] SSE endpoint + client reader with reconnect
- [ ] SSRF-safe fetcher
- [ ] Upload/URL/text endpoints + limits
- [ ] Add-source UI + live status
- [ ] Retry/delete cleanup (files + chunks)
- [ ] Tests + e2e

## Acceptance tests
1. A 100-page text PDF reaches `ready` in under 4 minutes on the target server using local EmbeddingGemma 2 on CPU (record actual number in the level report); `char_start/char_end` slice equals chunk text exactly.
2. DOCX, PPTX, TXT, MD, pasted text, and a news URL all reach `ready`.
3. Embedding output is 768-dim (or configured), L2-normalized (norm within 1e-3), never NaN; FP16 is never used (config test).
4. With the real model: query "how do I reset my password" ranks the relevant fixture sentence above 3 unrelated ones.
5. Corrupt file => `failed` with readable error; retry works; no duplicate chunks.
6. Loopback, link-local metadata IP, and redirects to private IPs are rejected.
7. Oversize file rejected before processing with a clear message.
8. Deleting a source removes chunks and stored file.
9. Changing `EMBED_BACKEND`/model on an existing notebook is blocked until "re-index" is run; re-index completes and queries work.
10. Two users uploading at once do not block each other; embed service memory stays below 4 GB.
11. SSE reconnect after drop and after token expiry resumes correct status; user B cannot read user A's events.

## Working condition
"I drop in a messy real PDF and a website; both become ready with visible progress, embeddings are generated locally by EmbeddingGemma 2, and failures are clean."
