# Level 3 verification report

Level 3 grounded chat is implemented on branch `level-3-grounded-chat`. Alembic is at revision `0004`. Browser journeys were run against Docker Compose with `EMBED_BACKEND=fake` and `LLM_PROVIDER=fake`; the production web build succeeded.

## Verified

- `ruff check .` and `mypy .` pass. ESLint and TypeScript pass.
- Python: 62 passed, one slow real-model test skipped by default; combined storage/embedding/queue coverage 90% (80% gate). Vitest: 2 passed. Playwright: all 6 journeys passed, including upload, citation chip and hover card, selection persistence, refusal, history reload, clear, and console-error check.
- `make eval` equivalent: hit-rate@8 = 15/15 (100%); citation validity = 15/15 (100%). Three checked-in documents and 15 expected-fact questions use deterministic local token vectors and the real retrieval/citation pipeline.
- Cancellation closes the upstream model stream within one second in a deterministic unit test. Five simultaneous chat streams complete. API tests cover JWT ownership, history, provider switching across five mocked routes, source isolation, prompt injection, and fabricated marker rejection.
- Docker Compose API and web images build, all services started, and Alembic reports `0004 (head)`.

## Live acceptance

The local `.env` contains `OPENROUTER_API_KEY` (the value is never written to the report) and `DEFAULT_CHAT_MODEL=google/gemini-3.1-flash-lite`. On 2026-10-19, `scripts/benchmark_level3.py` measured **2.346 s** from retrieval through the first OpenRouter token for the indexed synthetic 100-page notebook, passing the `<3 s` target. The local `.env` is ignored by Git; do not include a key in commits.
