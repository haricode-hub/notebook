# Level 0 verification

Date: 2026-10-17. Scope: Level 0 only. Verification used a separate Git clone at `open-notebook-l0-clean-20261017-b`, with `.env.example` copied to `.env`.

| Acceptance check | Result |
| --- | --- |
| Six Compose services healthy within 90 seconds | **Fail under the strict first-build clock**: first image build and startup took 402.2 seconds on this Windows/Docker Desktop host. With images built, all six became healthy in 22.1 seconds. The web image's dependency install (83.9 seconds) and Next.js build (79.0 seconds) form a sequential path longer than 90 seconds on this host. |
| API health and readiness | `/healthz` 200; `/readyz` 200 with `db`, `redis`, and `embed` all `ok`. Redis stopped: 503; after restart: 200. |
| Persisted ping job | Pass twice from the clean-clone stack; both jobs reached `succeeded (pong)`. |
| Tests and interface coverage | 29 Python tests passed; storage, queue, and embedding modules have 88.89% combined coverage. Two Vitest tests passed. GNU Make is not installed on this Windows host; the Makefile's recipes passed directly. The Python GitHub workflow now invokes `make lint`, `make typecheck`, and `make test` on Linux; its next run will verify those exact targets. |
| Environment-selected implementations | Pass: tests select memory/local storage, fake/HTTP embedding, and fake/LiteLLM by settings; `STORAGE_BACKEND=memory` and `EMBED_BACKEND=fake` are read from environment in the config test. |
| Frozen lockfile installs and Docker builds | `uv sync --frozen` and `uv sync --frozen --all-packages` succeeded under Python 3.13.5; `pnpm install --frozen-lockfile` succeeded; all four application images built from committed lockfiles. |
| Web readiness and generated types | Pass: Chrome Playwright smoke test showed API and embedding ready with no console errors; `openapi-typescript` regeneration left the clean clone unchanged. |
| PR CI | Pass at commit `b487ff9`: [Python](https://github.com/haricode-hub/notebook/actions/runs/39056829219) and [Web](https://github.com/haricode-hub/notebook/actions/runs/39056829224) passed on [PR #1](https://github.com/haricode-hub/notebook/pull/1). The next commit will require a fresh green run. |

The cold image build time includes dependency downloads and Next.js compilation. The 90-second service startup check was measured after images were built. The generated client was checked with `git diff --exit-code` and `git status --porcelain` from a clean clone.

Context7 and Playwright MCP were not available in this session. The current shadcn CLI was checked against the official shadcn documentation, and the UI was verified with the Playwright CLI in Chrome, including a screenshot and console-error assertion.

Current conclusion: Level 0 remains incomplete under the user's strict first-build 90-second limit. The first clean-clone Docker build took 402.2 seconds on this host. All other checks passed as noted above; the next commit needs CI verification.
