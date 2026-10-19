# Level 5 verification report

Date: 2026-10-19. Branch: `level-5-guides-notes`.

## Acceptance results

1. **Live guide timing:** A short text source uploaded through the browser produced a live OpenRouter guide with a summary, topics, and three questions in **20.8 s** (limit: 60 s). The worker used the configured cheap model. The embedding service used the fake backend for this timing run, so this measures upload, ingestion orchestration, indexing, cloud summarization, and browser refresh without local Gemma CPU time.
2. **Unchanged re-ingest cache:** `tests/test_level5.py` runs `summarize_source` twice and asserts the FakeLLM call count does not increase.
3. **Debounced overview:** The worker test adds a second source, schedules both overview generations, and asserts the older generation makes no model call while the latest overview includes the new source.
4. **Saved citations:** The browser saves a cited answer to a note, clicks the saved citation, and sees the highlighted source text. API tests also verify ownership.
5. **Converted note:** The browser converts a Markdown note into a source, waits for ready, deselects the original source, and obtains a citation to the converted source. The API integration test ingests the converted note with FakeEmbedding and searches its content.
6. **Suggested question:** The browser clicks a source-guide question and a notebook-overview question and receives cited answers.

## Gates

- Python 3.13.5: Ruff and mypy pass; pytest: **67 passed, 1 slow-model test skipped**. Core storage/embedding/queue coverage: **91.53%**.
- Web: ESLint passes with three existing/non-failing React Compiler warnings, TypeScript passes, Vitest **6 passed**.
- Docker Compose: updated API, worker, and web images build from frozen Python and pnpm lockfiles; services start; Alembic reports `0005 (head)`.
- Playwright: deterministic suite **9 passed, 1 live-only test skipped**; separate live OpenRouter timing test **1 passed**. The Level 5 journey records no browser console errors. A transient Level 4 PDF fallback assertion was made stable by waiting for the final text match.
- Context7 and Playwright MCP were unavailable; official Tiptap docs and Playwright CLI were used, recorded in ADR-008.

The live run used the locally configured key without logging its value. No secret file is committed.
