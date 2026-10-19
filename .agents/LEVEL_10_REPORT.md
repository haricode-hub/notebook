# Level 10: Hardening, Evals, Performance, and Scale Readiness

**Date:** 2026-10-19  
**Branch:** `complete-missing-level-work`  
**Status:** Implementation complete; runtime acceptance remains partial.

## Summary

Level 10 implementation covers quality evaluation and tuning, reliability and maintenance, security controls and audits, and a scale deployment path. The latest pushed Level 10 CI commit, `133db02`, passed the Python, Web, and Gitleaks workflows, including locked Python dependency audits for the uv workspace and isolated Python 3.12 TTS project.

Level 10 is **not fully acceptance-complete**. The 10-minute five-user k6 run, full e2e on the 3-web/3-API MinIO topology, workspace axe scan, and VPS deployment rehearsal have not run. The local Docker daemon cannot be started in this session, `k6` is not installed, and no VPS target is configured. Do not interpret static Compose validation as a successful scale test.

## Pass 1 — Quality

Implemented expanded evaluation fixtures and faithfulness measurement, logged one-variable-at-a-time RAG tuning in ADR-012, and added a same-question-set OpenRouter model comparison. Results are in `evals/results/openrouter-model-comparison.json`.

On the 30-question fixture, Gemini 3.1 Flash Lite scored 100% hit-rate@8, citation validity, faithfulness, and answer relevance, at an estimated $0.009977. DeepSeek V4 Flash scored 100%, 100%, 90%, and 100%, at an estimated $0.002867. Cost is an estimate from catalog prices and a fixed character/token approximation, not provider-reported billing. Gemini remains the configured default.

The Level 3 live 100-page first-token benchmark separately passed at **2.346 s**. It is recorded in `.agents/LEVEL_3_REPORT.md` and `docs/DECISIONS.md`.

## Pass 2 — Reliability and performance

Implemented retry/backoff and dead-letter visibility, provider fallbacks, timeouts, caches, graceful shutdown, database backup, and orphan cleanup. ADR-013 records the implementation and verification limits. The regression suite, Ruff, and mypy passed in the completion run.

Database query plan review and live-container maintenance behavior remain unverified because the local PostgreSQL/Docker runtime was unavailable. Earlier targeted reliability/cache/LLM tests passed; see `.agents/PROGRESS.md` and ADR-013 for the exact results and known test-temp-directory issue from the earlier run.

## Pass 3 — Security and operations

Implemented generated OpenAPI authorization coverage, Better Auth hardening, CSP/security headers, admin API/page, quotas and chat usage records, Python audit CI, and Gitleaks scanning. ADR-014 documents auth choices and audit setup. Local Python, web, and authorization-focused tests passed. The production JavaScript audit passed in the earlier recorded run; current GitHub CI passed Python dependency audits and Gitleaks on `133db02`.

The full live route sweep and multi-replica auth/rate-limit behavior still require the runtime environment. Langfuse is optional and is not configured.

## Pass 4 — Scale and documentation

Implemented `docker-compose.scale.yml` with three web replicas, three API replicas, MinIO/S3 storage, and Nginx proxies; a five-VU/10-minute k6 scenario; sample notebook onboarding; axe browser tests; and `docs/SCALING.md` deployment and operations instructions. Python and web checks passed. The axe tests on `/` and `/sign-in` found no critical violations; the signed-in workspace axe test has not run.

Static validation passed:

```text
docker compose -f docker-compose.yml -f docker-compose.scale.yml config -q
```

This validates Compose syntax only. The engine check failed because Docker Desktop's `com.docker.service` is stopped and Windows returned `Cannot open com.docker.service`, including on an elevated start attempt. The daemon pipe is unavailable. `k6` is absent, and there is no VPS hostname or deployment credential in the environment.

## Checks recorded

- Python regression suite: **112 passed, 1 skipped**.
- Ruff and mypy passed. Mypy excludes tests because boto3 stubs are unavailable.
- Web TypeScript passed; ESLint passed with 3 existing warnings; Vitest **6 passed**.
- CI at `133db02`: Python, Web, and Gitleaks passed; root and isolated TTS locked dependency audits passed.
- Scale Compose static configuration: passed.
- Public pages axe checks: **2 passed**, zero critical violations.
- Not run: k6, scale-stack e2e, signed-in workspace axe, VPS deployment rehearsal, and live Docker maintenance checks.

## Remaining acceptance gates

1. Run `k6 run load/level10.js` for 10 minutes with five isolated load-test accounts on the target stack; record error rate, chat latency/first-token logs, host memory, and queue drain.
2. Start the scale Compose deployment and run the full browser e2e suite through its proxies, including sign-in across replicas and S3-backed files.
3. Run the signed-in workspace axe test against that stack and confirm zero critical violations.
4. Complete and record the VPS deployment, TLS, backup, and restore rehearsal described in `docs/SCALING.md`.
5. Run live query-plan and maintenance/recovery checks against Docker-backed PostgreSQL and worker services.

These need a Docker-enabled runner and a VPS target. Until then, keep the Pass 4 runtime checklist open in `.agents/TASKS.md` and do not emit `L10_COMPLETE`.

## Related records

- [Level 10 specification](../docs/levels/LEVEL_10_hardening_scale.md)
- [Scaling guide](../docs/SCALING.md)
- [Task checklist](TASKS.md)
- [Progress log](PROGRESS.md)
- [Final level report](../FINAL_REPORT.md)
