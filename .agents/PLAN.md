# Level plan

Only one level is implemented at a time. The acceptance checks below are copied from each level spec.

# LEVEL 0: Foundation and Scale-Ready Skeleton

Source: `docs/levels/LEVEL_00_foundation.md`

### Acceptance tests

1. `docker compose up -d` from a clean clone: all containers healthy within 90 s.
2. `api /healthz` 200; `/readyz` 200 with `db, redis, embed` ok; stopping redis gives 503.
3. Ping job reaches `succeeded`.
4. `make test` passes with at least 15 tests; core interface coverage above 80%.
5. Changing `STORAGE_BACKEND` / `EMBED_BACKEND` via env swaps the implementation with no code edits.
6. `uv sync --frozen` (Python 3.13) and `pnpm install --frozen-lockfile` succeed in CI; Docker builds use lockfiles.
7. Web page renders api + embed status; `make types` regenerates a client with no diff on a clean tree.
8. CI green on a PR.


# LEVEL 1: Better Auth, Notebooks, Three-Panel Shell, Model Settings

Source: `docs/levels/LEVEL_01_auth_notebooks_shell.md`

### Acceptance tests

1. Sign up, sign in, reload: session persists; sign out clears it; signed-out visit to `/notebooks` redirects to sign-in.
2. FastAPI returns 401 for: no token, malformed, expired, wrong `aud`/`iss`, tampered signature, unknown `kid`.
3. Valid JWT: `GET /notebooks` returns only that user's notebooks.
4. User B gets 404 on GET/PATCH/DELETE of user A's notebook.
5. After JWKS key rotation the API accepts new-key tokens without restart.
6. API keys are not plaintext in the DB (test reads raw column).
7. Settings default to OpenRouter; "Test connection" succeeds with a valid key (or Ollama) and gives a clear error for a bad key.
8. Switching provider changes the LiteLLM route on the next call (spy test); the model list loads and is searchable.
9. Repeated failed sign-ins are throttled (429).
10. Panels resize/collapse; at 390 px they become tabs. Playwright e2e passes.


# LEVEL 2: Source Ingestion and EmbeddingGemma 2

Source: `docs/levels/LEVEL_02_ingestion_embeddings.md`

### Acceptance tests

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


# LEVEL 3: Grounded Chat With Citations (The Core)

Source: `docs/levels/LEVEL_03_grounded_chat.md`

### Acceptance tests

1. Eval set: retrieval hit-rate@8 >= 0.85; citation validity = 100%.
2. A question absent from sources returns the refusal sentence and zero citations.
3. Unselected sources never contribute chunks (assert on FakeLLM input).
4. First token in under 3 s (cloud model via OpenRouter) on a 100-page notebook.
5. Stop cancels the upstream call within 1 s.
6. Injection fixture has no effect on system behavior.
7. 5 simultaneous chats complete without errors.
8. History survives reload; clear chat works; another user cannot read it.
9. Switching provider/model in Settings changes the model used for the next answer (badge + spy).


# LEVEL 4: Source Viewer and Citation Jump

Source: `docs/levels/LEVEL_04_source_viewer.md`

### Acceptance tests

1. For 20 sampled eval citations the highlighted text contains the cited chunk text (>= 95% Text tab; >= 90% PDF tab; the rest show the fallback card).
2. A cached source opens in under 500 ms.
3. 300-page PDF scrolls smoothly; memory bounded via virtualization.
4. Keyboard navigation works; Esc closes.
5. Another user's or an expired signed URL returns 403/404.
6. `next build` succeeds with no SSR errors from pdf.js.


# LEVEL 5: Source Guide and Notes

Source: `docs/levels/LEVEL_05_guide_notes.md`

### Acceptance tests

1. A guide appears within 60 s of upload (cloud model) with summary, topics, 3 questions.
2. Re-ingesting unchanged content makes zero new summarization calls.
3. Overview updates after adding a source and does not fire repeatedly during multi-file uploads.
4. Save-to-note keeps working citations.
5. A note converted to a source is searchable in chat.
6. Clicking a suggested question yields a cited answer.


# LEVEL 6: Studio I (Text Artifacts)

Source: `docs/levels/LEVEL_06_studio_text_artifacts.md`

### Acceptance tests

1. All five types generate for a 50-page notebook in under 90 s and pass schema validation.
2. Invalid JSON triggers exactly one repair attempt, then a clean `failed` state with retry.
3. All artifact citations resolve and open the viewer.
4. Only selected sources influence the artifact.
5. Markdown, PDF, DOCX exports open correctly.
6. Adding a hypothetical sixth recipe needs under 60 lines of new backend code.


# LEVEL 7: Studio II (Mind Map, Flashcards, Quiz)

Source: `docs/levels/LEVEL_07_studio_interactive.md`

### Acceptance tests

1. Mind map for a 50-page notebook renders in under 2 s, at most 60 nodes, usable on mobile.
2. Every quiz question has exactly one correct answer and a cited explanation (validator + manual check of 10).
3. Flashcard progress persists across sessions; Leitner moves cards correctly.
4. Quiz attempt history stored; "review wrong answers" works.
5. Exports (PNG/SVG, CSV) work.


# LEVEL 8: Audio Overview (Podcast)

Source: `docs/levels/LEVEL_08_audio_overview.md`

### Acceptance tests

1. Default overview for a 30-page notebook completes in under 6 minutes on the target server; MP3 within 10% of target duration.
2. Clicking a transcript line seeks to its timestamp.
3. Injected unsupported claims are removed by the faithfulness pass.
4. Two users requesting audio at once: second queues; no crash; memory within limits.
5. Cancel stops processing and cleans up partial files.
6. Works fully offline with Ollama + Kokoro.


# LEVEL 9: Advanced Sources, Multimodal Retrieval, Discover, Share, Export

Source: `docs/levels/LEVEL_09_advanced_sources_multimodal_share.md`

### Acceptance tests

1. A 20-minute captioned YouTube video ingests and citations open at the right timestamps.
2. A 10-minute audio file transcribes on CPU in under 10 minutes and is searchable.
3. Discover returns candidates; importing 3 works; private-IP results are rejected.
4. Revoking a share link blocks it instantly; visitors cannot write or see other notebooks.
5. Export ZIP contains all notes and artifacts.
6. With `MULTIMODAL_ENABLED=true`: a text query about a chart in a test PDF returns that figure as a citation; with the flag off, behavior and memory use are unchanged from Level 8.
7. Merge function test proves ranking uses per-modality ranks, not raw cross-modal scores.
8. Embed service memory with multimodal on stays within the documented limit (recorded in ADR-006).


# LEVEL 10: Hardening, Evals, Performance, and Scale Readiness

Source: `docs/levels/LEVEL_10_hardening_scale.md`

### Acceptance tests

1. Eval targets: hit-rate@8 >= 0.9, citation validity 100%, faithfulness >= 0.9.
2. k6, 5 concurrent users, 10 minutes: error rate < 1%, chat first-token p95 < 4 s (cloud model), no OOM, queue drains.
3. Authorization sweep: every API route with another user's IDs returns 404/403; no token returns 401.
4. `uv run pip-audit` and `pnpm audit` show no high/critical; gitleaks clean.
5. Compose scale override (3 web + 3 API + MinIO) passes the full e2e suite; sign-in works across web replicas.
6. Killing the worker mid-ingestion then restarting retries cleanly with no duplicate chunks.
7. axe scan: zero critical violations on main screens.
8. Fresh-clone VPS deployment per README completes in under 30 minutes.
9. Non-admin cannot reach admin routes or admin API endpoints.
10. Primary model failure triggers the fallback model automatically and the answer still streams.

