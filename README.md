# OpenNotebook Studio

A source grounded research workspace. Level 0 provides the service foundation; product features begin in later levels.

## Start

Requires Docker Compose. Copy `.env.example` to `.env`, then run:

```sh
make dev
```

Open http://localhost:3000 to see API, database, Redis, and embedding readiness. The API exposes `/healthz` and `/readyz` at http://localhost:8000. The Level 0 embedding backend is deterministic and fake; the local Gemma 2 backend is reserved for Level 2.

`make smoke` enqueues a ping job and waits for its `jobs` row to reach `succeeded`. `make migrate` applies the Alembic migration if needed. `make types` regenerates the committed TypeScript types from FastAPI's OpenAPI schema.

## Local checks

Install Python 3.13, [uv](https://docs.astral.sh/uv/), Node 22, Corepack pnpm, and GNU Make. Then run:

```sh
uv sync --frozen --all-packages
pnpm install --frozen-lockfile
make lint
make typecheck
make test
```

On Windows without GNU Make, run the recipes in [Makefile](Makefile) directly. The browser smoke test runs with `pnpm --filter web e2e` against the running Compose stack.

Project instructions and level specifications are in [AGENTS.md](AGENTS.md) and [docs/levels](docs/levels). Architecture decisions are in [docs/DECISIONS.md](docs/DECISIONS.md), and implementation progress is in [.agents/PROGRESS.md](.agents/PROGRESS.md).
