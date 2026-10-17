# Architecture decision records

## ADR-001: Better Auth to FastAPI bridge

**Status:** Accepted for Level 1 implementation. Better Auth runs in Next.js and owns its auth tables. Browser sessions remain same-origin cookies. The browser obtains a short-lived JWT through the Better Auth JWT plugin and sends it directly to FastAPI for streaming and uploads. FastAPI checks the JWKS signature, issuer, audience, expiry, and subject, caches the JWKS, and refreshes on an unknown key ID. FastAPI never reads auth tables; app records use `user_id TEXT`. Alembic excludes Better Auth tables, while Better Auth migrations own them. API CORS permits only `WEB_ORIGIN`; bearer API calls do not require cookie CSRF protection.

## ADR-002: uv workspace, pnpm, and Python 3.13

**Status:** Accepted. All Python projects require `>=3.13,<3.14`; root `.python-version` is `3.13`. A single uv workspace and committed `uv.lock` control Python dependencies. Commands run through `uv run`; CI and images use `uv sync --frozen`. pnpm and a committed lockfile control the Next.js workspace. Dependencies incompatible with Python 3.13 get an isolated service and a new ADR rather than a global downgrade.

The current shadcn CLI command for this scaffold is `pnpm dlx shadcn@latest add button`, verified against the [official CLI documentation](https://ui.shadcn.com/docs/cli) and used to generate the Button. Context7 was unavailable in this execution environment.

## ADR-003: Separate embedding service

**Status:** Accepted. `apps/embed` holds one model process behind HTTP `/embed`, `/healthz`, and `/readyz`. API and worker use the same `EmbeddingProvider` contract. The `fake` backend is deterministic for tests; the `gemma2` backend is deliberately a Level 2 stub until model-card details and resource use are verified. `EMBED_DIM` defaults to 768. Batch limits and a concurrency guard live in the service. Stored embedding model and dimension will be checked at ingestion; switching requires reindexing. Text anchors remain necessary for citations.

The [official EmbeddingGemma 2 model card](https://huggingface.co/google/embeddinggemma-2) confirms 768/512/256/128 dimensions, query and document task prefixes, and BF16/FP32 inference. The real backend must use `SearchQuery` and `Document` prompts and normalize vectors after truncation; that implementation remains scoped to Level 2.
