# Architecture

Level 0 runs a Next.js web process, FastAPI API, arq worker, embedding HTTP service, PostgreSQL with pgvector, and Redis. The API remains stateless. Core interfaces own provider selection and keep filesystem and queue details out of routes. See `AGENTS.md` and `docs/DECISIONS.md` for contracts.
