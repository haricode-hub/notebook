# OpenNotebook Studio

OpenNotebook Studio is a source-grounded research workspace. Upload documents, ask questions with clickable citations, and create study guides, briefs, timelines, mind maps, flashcards, quizzes, and audio overviews.

## Run locally

Install Docker Compose, Python 3.13, [uv](https://docs.astral.sh/uv/), Node 22, and Corepack. Copy `.env.example` to `.env`, set `BETTER_AUTH_SECRET`, `SETTINGS_ENCRYPTION_KEY`, and `OPENROUTER_API_KEY`, then start the services:

```sh
docker compose up --build -d
docker compose exec api alembic -c packages/core/alembic.ini upgrade head
docker compose run --rm auth-migrate
```

Open [http://localhost:3000](http://localhost:3000), create an account, and create a notebook. API readiness is at [http://localhost:8000/readyz](http://localhost:8000/readyz).

To try the sample corpus, sign in and obtain a short-lived Better Auth JWT from `/api/auth/token`. Then run:

```sh
SAMPLE_USER_TOKEN=YOUR_SHORT_LIVED_JWT make sample
```

The command creates a notebook with the observatory field notes, queues ingestion, and prints its URL after indexing finishes. The sample document is in [docs/samples/observatory-notebook.md](docs/samples/observatory-notebook.md).

## Checks and evaluation

```sh
uv sync --frozen --all-packages
pnpm install --frozen-lockfile
make lint
make typecheck
make test
make eval
```

`make eval` prints hit-rate@8, citation validity, lexical faithfulness, and expected-fact relevance for the checked-in golden set. The experiment history and live OpenRouter model comparison are recorded in [docs/DECISIONS.md](docs/DECISIONS.md). For deployment and load-test procedures, see [docs/SCALING.md](docs/SCALING.md).

## Architecture and operations

The web app uses Next.js App Router and Better Auth. FastAPI verifies its JWTs and serves notebook, source, chat, and artifact APIs. PostgreSQL/pgvector stores metadata and embeddings; Redis carries jobs and progress events; the arq worker handles ingestion and generation. EmbeddingGemma is served locally. Source files use local storage by default, with an S3-compatible backend available for scale deployments. Compose starts web, API, worker, embed, TTS, PostgreSQL, and Redis.

- [Architecture decisions](docs/DECISIONS.md)
- [Security operations](docs/SECURITY.md)
- [Scaling and deployment](docs/SCALING.md)
- [Level specifications](docs/levels)
- [Operational progress](.agents/PROGRESS.md)

For Windows without GNU Make, execute the relevant recipes in [Makefile](Makefile) with `uv` and `pnpm` directly.
