# LEVEL 10: Hardening, Evals, Performance, and Scale Readiness

Prerequisite: `AGENTS.md`; Levels 0-9 complete.

## Feature name
Production polish, quality measurement, and the scale path.

## Objectives and goals
- Dependable for real users, measurable quality, ready to scale.

## Scope
- **Quality:** 30+ eval questions over 6 docs; metrics hit-rate@k, citation validity, faithfulness (LLM-judge or Ragas), answer relevance; tuning loop over chunk size/overlap/top-k/reranker/embedding dim (768 vs 512 vs 256 Matryoshka) and prompt; result history. Compare chat models through OpenRouter on the same eval set (cost vs quality table).
- **Performance:** EXPLAIN-verified indexes, timing logs, embedding/summary caches, pool tuning, gzip, static caching, Next.js code splitting, embed batching tuned.
- **Reliability:** job retries with backoff and dead-letter, graceful shutdown, timeouts everywhere, OpenRouter fallback models and provider fallback on errors, pg_dump backup script, orphaned file cleanup.
- **Security:** OWASP checklist, `uv run pip-audit` and `pnpm audit`, upload hardening, CSP and security headers (Next.js and API), gitleaks, auto-generated authorization sweep over every API route, Better Auth hardening (secure cookies, trusted origins, Redis/DB rate-limit store, optional 2FA, email verification when SMTP is set).
- **Admin/ops:** admin page (Better Auth admin plugin or role claim) for jobs/errors, per-user quotas (sources, tokens/day), cost logging, optional Langfuse tracing.
- **Load test:** k6 for 5 concurrent users (sign in, upload, chat, generate).
- **Scale docs/tests:** `docs/SCALING.md` with tested steps for 3 web + 3 API replicas behind a proxy, S3/MinIO storage, managed Postgres, moving embed to a GPU host or remote backend.
- **A11y/polish:** keyboard navigation, ARIA, contrast, error boundaries, empty states, onboarding sample notebook.
- **Docs:** README with GIFs, architecture diagram, VPS deployment guide with Caddy/Traefik TLS.

## Agent Prompt
```

Read AGENTS.md and this file. Levels 0-9 are done. Execute LEVEL 10 only, in four passes with commits per pass.

PASS 1 Quality: expand evals, add faithfulness metric, run the RAG tuning loop (one variable at a time; log each experiment in docs/DECISIONS.md; keep only improvements); run the model comparison through OpenRouter and record cost vs quality.

PASS 2 Reliability + performance: retries/backoff/dead-letter, timeouts, fallback models, caches, EXPLAIN review, graceful shutdown, backup + cleanup jobs.

PASS 3 Security + ops: auto-generated authorization sweep across all routes, uv pip-audit + pnpm audit, CSP/security headers, gitleaks, Better Auth hardening (confirm options via Context7), admin page, quotas, optional Langfuse.

PASS 4 Scale + docs: k6 for 5 concurrent users, docker-compose.scale.yml with 3 web + 3 API replicas + MinIO behind a proxy, verify e2e passes against it, write SCALING.md and README, onboarding sample notebook, axe a11y pass with Playwright.
Output <promise>L10_COMPLETE</promise> when acceptance tests pass.

```

## Task checklist
- [ ] expanded evals + faithfulness + tuning loop + model comparison
- [ ] retries, dead-letter, fallbacks, shutdown, backups, cleanup
- [ ] EXPLAIN/index/caching/pool tuning
- [ ] authorization sweep + audits + headers + gitleaks
- [ ] Better Auth hardening + admin + quotas
- [ ] k6 + scale compose + SCALING.md
- [ ] a11y + onboarding notebook + README

## Acceptance tests


1. Eval targets: hit-rate@8 >= 0.9, citation validity 100%, faithfulness >= 0.9.
2. k6, 5 concurrent users, 10 minutes: error rate < 1%, chat first-token p95 < 4 s (cloud model), no OOM, queue drains.
3. Authorization sweep: every API route with another user's IDs returns 404/403; no token returns 401.
4. `uv run pip-audit` and `pnpm audit` show no high/critical; gitleaks clean.
5. Compose scale override (3 web + 3 API + MinIO) passes the full e2e suite; sign-in works across web replicas.
6. Killing the worker mid-ingestion then restarting retries cleanly with no duplicate chunks.
7. axe scan: zero critical violations on main screens.
8. Fresh-clone VPS deployment per README completes in under 30 minutes.
9. Non-admin cannot reach admin routes or admin API endpoints.
10. Primary model failure triggers the fallback model automatically and the answer still streams.



## Working condition
"I'd let friends use this for real, I know its quality numbers, and I know exactly how to scale it."
