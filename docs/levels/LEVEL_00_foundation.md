# LEVEL 0: Foundation and Scale-Ready Skeleton

Prerequisite: read `AGENTS.md`. No earlier levels.

## Feature name
Monorepo, infra, uv workspace (Python 3.13), Next.js shell, embed service skeleton, and the scaling seams.

## Objectives and goals
- Everything runs with one command; zero product features, all seams in place.
- Fast feedback loop and CI that blocks broken code.
- Decide and document the auth bridge, uv policy, and embedding-service design early (ADRs).

## Scope
- uv workspace (Python 3.13) + pnpm; Docker Compose: web, api, worker, embed, postgres+pgvector, redis.
- Alembic with pgvector and pg_trgm extensions; `include_object` filter reserved for Better Auth tables.
- Interfaces + Local/Fake implementations: StorageBackend, JobQueue, LLMProvider, EmbeddingProvider (Http + Fake), TTSProvider (interface only), SearchProvider (interface only).
- `apps/embed` skeleton: FastAPI with `/healthz`, `/embed`, backend `fake` working now (real `gemma2` arrives in Level 2).
- `/healthz` and `/readyz` on api and embed; JSON logging; request-id; consistent error schema; CORS limited to WEB_ORIGIN.
- Next.js page that shows API + embed readiness through a typed OpenAPI client.
- Makefile, GitHub Actions, `.env.example`, ADR-001 (auth bridge), ADR-002 (uv + pnpm + Python 3.13 policy), ADR-003 (embedding service).

## Agent Prompt (paste this)
```
Read AGENTS.md fully and this level file. Execute LEVEL 0 only.
1. Create .agents/PLAN.md (levels 0-10 with acceptance tests, from docs/levels) and .agents/TASKS.md (Level 0 detailed; other levels as headings; tasks <=2h each).
2. Scaffold per the repo layout. Python: uv workspace, .python-version 3.13, requires-python ">=3.13,<3.14", dev group (ruff, mypy, pytest, pytest-asyncio, httpx). Web: pnpm + Next.js App Router + TypeScript + Tailwind + shadcn/ui (confirm current CLI via Context7).
3. packages/core: pydantic-settings config, async SQLAlchemy session, Alembic initial migration (vector, pg_trgm), env.py include_object filter ignoring Better Auth tables (user, session, account, verification, jwks and later plugin tables). Interfaces and implementations: StorageBackend(LocalDiskStorage), JobQueue(ArqQueue), LLMProvider(LiteLLMProvider, FakeLLMProvider), EmbeddingProvider(HttpEmbeddingProvider, FakeEmbedding deterministic hash-based, dimension from EMBED_DIM default 768), TTSProvider and SearchProvider interfaces only.
4. apps/api: FastAPI with /healthz, /readyz (DB, Redis, embed), request-id middleware, JSON logging, CORS limited to WEB_ORIGIN, error schema.
5. apps/embed: FastAPI with /healthz, /readyz, POST /embed {texts[], kind: "query"|"document", dim}; EMBED_BACKEND=fake implemented; leave a clearly marked stub for gemma2.
6. apps/worker: arq worker with a "ping" job writing to the jobs table.
7. apps/web: Next.js standalone output, zod env validation, a server page calling the API /readyz, OpenAPI TS client via `make types`.
8. Dockerfiles (uv multi-stage with `uv sync --frozen --no-dev`; Next.js standalone), docker-compose.yml with healthchecks and volumes.
9. Makefile: dev, test, lint, typecheck, migrate, seed, types. GitHub Actions: python (uv sync --frozen; ruff, mypy, pytest with postgres+redis services) and web (pnpm install --frozen-lockfile; lint, tsc, vitest, build).
10. Write ADR-001, ADR-002, ADR-003 in docs/DECISIONS.md.
11. Tests: config loading, storage put/get/delete, queue ping job, readyz up/down, FakeEmbedding determinism and dimension, embed service /embed with fake backend, web smoke test.
Verify from a clean clone. Small commits. Output <promise>L0_COMPLETE</promise> only when every acceptance test passes.
```

## Task checklist
- [ ] uv workspace (3.13) + pnpm + lint/type tooling
- [ ] Config, env, `.env.example`
- [ ] DB session + Alembic + extensions + include_object filter
- [ ] Interfaces + Local/Fake implementations
- [ ] FastAPI app, health, logging, error schema
- [ ] embed service skeleton (fake backend)
- [ ] arq worker + jobs table + ping job
- [ ] Next.js shell + readiness page + OpenAPI client
- [ ] Dockerfiles + Compose
- [ ] Makefile + CI
- [ ] ADR-001/002/003
- [ ] Tests

## Acceptance tests
1. `docker compose up -d` from a clean clone: all containers healthy within 90 s.
2. `api /healthz` 200; `/readyz` 200 with `db, redis, embed` ok; stopping redis gives 503.
3. Ping job reaches `succeeded`.
4. `make test` passes with at least 15 tests; core interface coverage above 80%.
5. Changing `STORAGE_BACKEND` / `EMBED_BACKEND` via env swaps the implementation with no code edits.
6. `uv sync --frozen` (Python 3.13) and `pnpm install --frozen-lockfile` succeed in CI; Docker builds use lockfiles.
7. Web page renders api + embed status; `make types` regenerates a client with no diff on a clean tree.
8. CI green on a PR.

## Working condition
"I run `make dev`, open localhost:3000, see green API and embed health, and I can swap storage/LLM/embedding implementations by env var."
