# Tasks

## Level 0: Foundation

- [x] 0.1 Document the level plan, tasks, and ADRs (<=2h)
- [x] 0.2 Create uv workspace, Python 3.13 lockfile, and lint/type/test configuration (<=2h)
- [x] 0.3 Implement config, database models/session, Alembic migration and auth-table exclusion (<=2h)
- [x] 0.4 Implement storage, queue, LLM, embedding, TTS and search contracts (<=2h)
- [x] 0.5 Build FastAPI health/readiness, middleware, logging, and errors (<=2h)
- [x] 0.6 Build fake embed service and Gemma 2 stub (<=2h)
- [x] 0.7 Build arq worker and persisted ping job (<=2h)
- [x] 0.8 Scaffold Next.js, Tailwind, shadcn, typed readiness page and smoke test (<=2h)
- [x] 0.9 Add Dockerfiles, Compose, Makefile, and CI (<=2h)
- [ ] 0.10 Add >=15 meaningful tests, verify all acceptance tests, record report and commit (<=2h)

## Level 1: Auth, notebooks, shell and settings

- [x] 1.1 Verify current auth/LLM integration APIs and record ADR-004
- [x] 1.2 Add Better Auth server/client config, schema migration, env and Compose wiring
- [x] 1.3 Add sign-in/up/out and protected Next.js routes
- [x] 1.4 Add JWKS verification and isolated notebook CRUD in FastAPI
- [x] 1.5 Add encrypted user settings, model listing and provider connection checks
- [x] 1.6 Add typed browser API client, notebook list and workspace shell
- [x] 1.7 Add settings UI, theme, toasts and loading states
- [x] 1.8 Verify JWT/ownership/settings tests, Playwright journey and all gates; commit

## Level 2: Ingestion and embeddings

- [x] 2.1 Verify EmbeddingGemma 2 documentation and Python 3.13 dependencies; write ADR-005
- [x] 2.2 Load and warm the text-only FP32 embedding backend; preserve fake backend
- [x] 2.3 Add source/chunk schema, HNSW/GIN indexes, extractors, and offset-safe chunking
- [x] 2.4 Add source API, SSRF-safe fetching, upload limits, worker stages, events, and atomic reindex
- [x] 2.5 Add source panel, upload progress, retry/delete, and token-refreshing SSE
- [x] 2.6 Pass all gates, 100-page benchmark, and Playwright journeys; record report and commit

## Level 3: Grounded chat

- [x] 3.1 Add selected-source schema and owned hybrid/full-context retrieval
- [x] 3.2 Add grounded prompt, citation validation, and chat persistence
- [x] 3.3 Stream owned chat over SSE with limits and cancellation
- [x] 3.4 Add typed chat UI, citation chips, source selection, history and clear
- [x] 3.5 Add unit/integration tests and a 15-question offline evaluation
- [ ] 3.6 Pass all gates and browser journey; record report and commit

## Level 4: Source viewer

- [x] 4.1 Add owned content endpoint and expiring, user-bound signed PDF URLs
- [x] 4.2 Build virtualized PDF and Text source viewer with citation highlighting
- [x] 4.3 Connect citation and source controls, navigation, rename and details
- [x] 4.4 Verify offset mapping, signed URLs, 20 citation samples and 300-page PDF
- [x] 4.5 Pass lint, types, tests, production build and browser journeys; record report and commit

## Level 5: Source guides and notes

## Level 6: Text study artifacts

## Level 7: Interactive study artifacts

## Level 8: Audio overview

## Level 9: Advanced sources and sharing

## Level 10: Hardening and scaling
