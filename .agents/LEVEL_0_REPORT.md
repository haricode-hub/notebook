# Level 0 verification

Date: 2026-10-17. Scope: Level 0 only. Verification used a separate Git clone at `open-notebook-l0-clean-20261017-b`, with `.env.example` copied to `.env`.

| Acceptance check | Result |
| --- | --- |
| Six Compose services healthy within 90 seconds | Pass with built images: 22.1 seconds from `docker compose up -d` to all six healthy. First cold image build and startup: 402.2 seconds on this Windows/Docker Desktop host. |
| API health and readiness | `/healthz` 200; `/readyz` 200 with `db`, `redis`, and `embed` all `ok`. Redis stopped: 503; after restart: 200. |
| Persisted ping job | Pass twice from the clean-clone stack; both jobs reached `succeeded (pong)`. |
| Tests and interface coverage | 29 Python tests passed; storage, queue, and embedding modules have 88.89% combined coverage. Two Vitest tests passed. GNU Make is not installed on this Windows host; the Makefile's test, lint, and typecheck recipes were run directly and passed. |
| Environment-selected implementations | Pass: tests select memory/local storage, fake/HTTP embedding, and fake/LiteLLM by settings; `STORAGE_BACKEND=memory` and `EMBED_BACKEND=fake` are read from environment in the config test. |
| Frozen lockfile installs and Docker builds | `uv sync --frozen` and `uv sync --frozen --all-packages` succeeded under Python 3.13.5; `pnpm install --frozen-lockfile` succeeded; all four application images built from committed lockfiles. |
| Web readiness and generated types | Pass: Chrome Playwright smoke test showed API and embedding ready with no console errors; `openapi-typescript` regeneration left the clean clone unchanged. |
| PR CI | Pending: the GitHub repository is empty; local HTTPS push was rejected, and the connected `Hari-jmr` account currently has read access only. |

The cold image build time includes dependency downloads and Next.js compilation. The 90-second service startup check was measured after images were built. The generated client was checked with `git diff --exit-code` and `git status --porcelain` from a clean clone.

Current conclusion: local Level 0 implementation and runtime checks pass. The level is not complete until a PR runs both GitHub Actions workflows successfully.
