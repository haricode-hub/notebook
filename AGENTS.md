# AGENTS.md (also save as CLAUDE.md in the repo root)

Global context for every session. Read this first, then read the level file you are working on (`docs/levels/LEVEL_NN_*.md`). Work on ONE level at a time.

## Project
"OpenNotebook Studio": a source-grounded research workspace (NotebookLM clone). Users add sources, chat with an AI that answers ONLY from those sources with clickable citations, and generate study artifacts (guides, mind maps, quizzes, audio overview).



## Target load and philosophy
- Target: about 5 concurrent users on one small server (2-4 vCPU, 8 GB RAM recommended because of the local embedding model; no GPU needed when using cloud LLMs).
- Build the simplest correct thing, behind interfaces, so scaling later is a config change, not a rewrite.
- No Kubernetes, no microservice sprawl, no graph DB. Services: web, api, worker, embed, postgres, redis (+ optional ollama).

## Chosen stack (deviate only with an ADR in docs/DECISIONS.md)
| Layer | Choice | Notes |
|---|---|---|
| Web | Next.js (App Router) + TypeScript, Tailwind, shadcn/ui, TanStack Query, Zustand | `output: "standalone"` in Docker |
| Auth | Better Auth inside Next.js (same Postgres) | email+password, optional Google/GitHub, JWT plugin for the API |
| API | **Python 3.13.x**, FastAPI, Pydantic v2, SQLAlchemy 2 async, Alembic | AI/RAG/ingestion backend |
| Python packages | **uv** workspace, `uv.lock`, `uv run`, `uv sync --frozen` | never call pip/poetry directly |
| JS packages | pnpm | uv is Python-only |
| Database | PostgreSQL 16 + pgvector | vectors are `vector(768)` by default (see Embeddings) |
| Jobs | Redis + arq worker (concurrency 2-4) | |
| Embeddings | **EmbeddingGemma 2** (`google/embeddinggemma-2`) served by our own `apps/embed` service | local, free, multimodal-capable |
| LLM | **OpenRouter by default**, switchable in Settings to Gemini / OpenAI / Anthropic / Ollama, via LiteLLM | |
| Files | `StorageBackend` interface: LocalDiskStorage now, S3/MinIO later | |
| Realtime | SSE over `fetch` streaming | see "What realtime means here" |
| Deploy | Docker Compose; Caddy/Traefik TLS at Level 10 | |

### Python 3.13.x policy
- Root `.python-version` = `3.13`; every `pyproject.toml` has `requires-python = ">=3.13,<3.14"`.
- Some ML/audio packages lag new Python versions. Before adding a dependency, check it installs on 3.13 (`uv add` + import test in CI). If one blocks (e.g. an audio/TTS lib), do NOT downgrade everything: write an ADR and isolate that dependency in its own small uv project/service.

## LLM layer (OpenRouter default, switchable)
- One `LLMProvider` interface; implementation uses LiteLLM. Providers: `openrouter` (default), `gemini`, `openai`, `anthropic`, `ollama`.
- Settings (per user): provider, chat model, "cheap model" (for summaries), API key (Fernet-encrypted). A server-level default key (`OPENROUTER_API_KEY`) may exist so users can start without their own key; per-user key overrides it.
- OpenRouter model slugs change often: never hardcode model names in code. Defaults come from env (`DEFAULT_CHAT_MODEL`, `DEFAULT_CHEAP_MODEL`); the Settings model picker loads the live list from OpenRouter's models endpoint (and a curated list for other providers). Confirm current LiteLLM OpenRouter usage via Context7.
- Not every model supports JSON mode / structured output / tool calls. All structured generation must be validated with Pydantic and use one repair retry; never assume the model obeys the schema.
- Chat uses streaming. All calls: timeout, retry with backoff, token/cost logging, global semaphore.
- OpenRouter can be given fallback models; expose "fallback model" in settings (Level 10 uses it).

## Embeddings (EmbeddingGemma 2)
Facts to rely on (confirm against the official model card via Context7/web before coding):
- Open weights, Apache 2.0, about 740M params in the full multimodal form; text, code, image, audio, video map into ONE shared, L2-normalized 768-dim space. Matryoshka sizes: 768 / 512 / 256 / 128 (truncate then re-normalize). Text context 8,192 tokens.
- A lighter text-only configuration can be loaded (smaller footprint) and vision/audio encoders added only if needed.
- It is trained with **short task prefixes** (query vs document). Use the exact prefixes from the model card; wrong or missing prefixes hurt quality.
- Run in **BF16 or FP32, never FP16** (NaN / degraded embeddings).
- Cross-modal similarity scores are **not calibrated across modalities**: never compare raw text-to-text scores against text-to-image scores. Retrieve per modality, then merge by rank (RRF).
- Loads through `sentence-transformers` (`SentenceTransformer("google/embeddinggemma-2")`); newer Transformers builds are required.

Design rules:
- `apps/embed` is a small FastAPI service that loads the model once and exposes `/embed` (batch, with `kind: query|document`, `dim`) and `/healthz`. The api and worker call it via `HttpEmbeddingProvider`. Backends selected by env `EMBED_BACKEND`: `gemma2` (default), `fake` (tests), `openrouter`/`openai`/`gemini`/`ollama` (remote fallbacks; confirm each exists and its dimension).
- Default stored dimension: 768 (`EMBED_DIM`). Optionally 512/256 later for smaller indexes. Vector column dimension is fixed per deployment; each source stores `embedding_model` + `embedding_dim`. Refuse mixing; provide a "re-index notebook" job for model/dimension changes.
- Batch embedding with size limits and a concurrency cap (CPU-bound); first request warms the model; `/readyz` waits for model load.
- Text citations stay primary: even for multimodal items, every retrievable item needs a human-readable text anchor (caption, transcript, OCR) so citations still work.

## How auth works across Next.js and FastAPI (ADR-001)
1. Better Auth lives in Next.js at `/api/auth/*` and owns tables `user, session, account, verification, jwks` (and plugin tables) in Postgres.
2. Browser authenticates with Better Auth session cookies (same origin as Next.js).
3. To call FastAPI, the client gets a short-lived JWT from Better Auth (JWT plugin, `authClient.token()`), sends `Authorization: Bearer <jwt>` DIRECTLY to FastAPI (so SSE and uploads stream without a proxy hop).
4. FastAPI verifies the signature against Better Auth's JWKS endpoint (cached; refresh on unknown `kid`), checks `iss`, `aud`, `exp`; `sub` = user_id; optional `role` claim.
5. FastAPI never reads Better Auth tables. App tables use `user_id TEXT` (no cross-owner FK).
6. Migration ownership: Better Auth CLI owns auth tables; Alembic owns app tables and excludes auth tables via `include_object`.
7. Bearer tokens mean CSRF does not apply to the API; CORS allows only WEB_ORIGIN.
8. Route protection in Next.js uses Better Auth's session check in the request interceptor (middleware or `proxy`, depending on Next.js major version; confirm via Context7).
9. Fallback only via new ADR: thin Next.js BFF forwarding to FastAPI with an internal service token.

## What "realtime" means here
Realtime = the server pushes updates to the browser without a page refresh or polling: chat answers appearing token by token, ingestion progress ("extracting... embedding... ready"), generation progress for studio items, audio job stages. We use **SSE (Server-Sent Events)**: a one-way server-to-browser stream over normal HTTP. Reasons: simpler than WebSockets, works through proxies, auto-reconnect friendly, and chat/progress only needs server-to-client. Because we must send an `Authorization` header, use `fetch` streaming (`@microsoft/fetch-event-source` or a small custom reader) instead of the native `EventSource`. Redis pub/sub carries events from the worker to the API process that holds the SSE connection. WebSockets are only worth adding later for interactive audio or multi-user live collaboration.

## Scale-ready contracts (build from Level 0)
1. Stateless API (identity from JWT; state in DB/Redis).
2. StorageBackend (`put/get/delete/url`); no direct filesystem access elsewhere.
3. JobQueue wrapping arq; every long task is a `jobs` row with status.
4. LLMProvider / EmbeddingProvider / TTSProvider / SearchProvider: one place per capability; timeouts, retries, logging.
5. Concurrency guards: global LLM semaphore (default 4), embed concurrency cap, per-user rate limit (Redis), DB pool 10, body-size and upload limits (50 MB default).
6. Config via env only (pydantic-settings; zod for Next.js); `.env.example` always current.
7. Observability: JSON logs with request id, `/healthz` + `/readyz`, timing logs.
8. DB: every query scoped by `user_id` / `notebook_id`; FK indexes, GIN on tsvector, HNSW on embeddings.
9. Better Auth rate-limit store moves to Redis/DB once there is more than one web replica.

| Bottleneck | Now (5 users) | Later |
|---|---|---|
| Web | 1 Next.js container | N replicas (sessions in DB) |
| API | 1 container, 2 uvicorn workers | N replicas (JWT stateless) |
| Jobs | 1 worker | more workers |
| Embeddings | 1 embed container on CPU | GPU box, or remote provider via EMBED_BACKEND |
| Files | local volume | S3/MinIO via env var |
| Vectors | pgvector HNSW | managed/bigger Postgres, or Qdrant adapter |
| LLM | shared semaphore + OpenRouter fallbacks | per-tenant queues |

## Repo layout (uv workspace + pnpm)
```
/apps/web        Next.js (Better Auth in src/lib/auth.ts, app/api/auth/[...all]/route.ts)
/apps/api        FastAPI (routers/, services/, schemas/, deps/)
/apps/worker     arq worker
/apps/embed      EmbeddingGemma 2 service
/packages/core   shared Python: models, config, llm/, embeddings/, tts/, storage/, queue/, retrieval/, prompts/
/docs            ARCHITECTURE.md, DECISIONS.md, PROMPTS.md, SCALING.md, levels/ (the LEVEL_NN files)
/evals           golden docs, questions, scripts
/.agents         PLAN.md, TASKS.md, PROGRESS.md, LOOP_PROMPT.md
pyproject.toml (uv workspace root), .python-version, uv.lock, pnpm-lock.yaml
docker-compose.yml, Makefile, .env.example
```

## uv rules
- Root `[tool.uv.workspace] members = ["apps/api","apps/worker","apps/embed","packages/core"]`.
- Add deps: `uv add <pkg> --package <member>`; dev tools in a root `dev` group (ruff, mypy, pytest, pytest-asyncio, httpx).
- Run through `uv run`. Docker: `uv sync --frozen --no-dev` with a cached layer. CI: `uv sync --frozen`. Commit `uv.lock`.

## Core engineering rules
1. Grounding first: answers only from retrieved sources; never invent citations; validate citations server-side.
2. Everything slow is a background job with visible status and retry.
3. Stream chat and generation.
4. Typed contracts: Pydantic -> OpenAPI -> generated TS types (`openapi-typescript`). No `any`.
5. No feature is done without tests (unit + one integration/e2e path). Use FakeLLM / FakeEmbedding / FakeTTS for determinism.
6. Secrets only in env; small conventional commits; docs current.
7. Use Context7 MCP for current docs (Next.js, Better Auth, shadcn, FastAPI, LiteLLM/OpenRouter, pgvector, sentence-transformers, EmbeddingGemma 2); use Playwright MCP to verify the UI yourself.
8. Next.js: Server Components by default; `"use client"` only where needed (chat, viewer, editors). Browser-only libs (react-pdf, React Flow, Tiptap) load via `next/dynamic` with `ssr: false` when required.
9. If blocked 3 attempts on the same problem: log it, pick the simplest workaround, write an ADR, move on.

""
All UI work must follow DESIGN.md exactly. Read it before touching any component. Never hard-code colors, sizes, radii or shadows.""

## Session protocol
1. Read `.agents/PLAN.md`, `.agents/TASKS.md`, last 40 lines of `.agents/PROGRESS.md`, and the current level file.
2. Take the first unchecked task of the current level; restate its acceptance criteria; implement the smallest slice.
3. Verify (lint, typecheck, tests, UI via Playwright), commit, tick the task, log to PROGRESS.md.
4. Never leave the repo broken at the end of a session.

## Universal Definition of Done for any level
- [ ] `make lint && make typecheck && make test` green (ruff, mypy, pytest via uv; eslint, tsc, vitest for web)
- [ ] `docker compose up` works from a clean clone with only `.env` filled
- [ ] The level's acceptance tests pass; earlier levels' tests still pass
- [ ] No browser console errors during the level's user journey
- [ ] Docs and `.env.example` updated; committed
