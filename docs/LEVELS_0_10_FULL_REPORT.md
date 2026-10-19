# OpenNotebook Studio — Levels 0–10 Completion Report

**Updated:** 2026-10-19  
**Branch:** `complete-missing-level-work`  
**Status:** Levels 1–8 complete by recorded acceptance results. Levels 0, 9, and 10 have outstanding acceptance gates.

## Executive summary

This report consolidates the available level reports, task checklist, and progress notes. It describes implementation and verification separately: code can be present while a runtime acceptance test remains unrun.

| Level | Area | Status | Remaining acceptance work |
|---:|---|---|---|
| 0 | Foundation | **Partial** | Clean-clone first image build plus startup exceeded the strict 90-second target (402.2 s). |
| 1 | Auth, notebooks, settings | **Complete** | None recorded. |
| 2 | Ingestion and embeddings | **Complete** | None recorded; optional real-model test was also run locally and passed. |
| 3 | Grounded chat | **Complete** | None recorded; live OpenRouter first token was 2.346 s against a <3 s target. |
| 4 | Source viewer | **Complete** | None recorded. |
| 5 | Guides and notes | **Complete** | None recorded; live guide timing was 20.8 s against a 60 s target. |
| 6 | Text artifacts | **Complete** | None recorded. |
| 7 | Interactive artifacts | **Complete** | None recorded. |
| 8 | Audio overview | **Complete** | None recorded for the FakeTTS acceptance path; live Kokoro inference was not part of that test. |
| 9 | Advanced sources and sharing | **Partial** | Pass C discover/share browser and full live security e2e remain unrun. |
| 10 | Quality, reliability, security, scale | **Partial** | k6, scaled e2e, workspace axe, live query-plan/recovery checks, and VPS rehearsal remain unrun. |

The main environment blocker is Docker Engine: its service is stopped and this session cannot open it. `k6` is not installed, and a VPS target is not configured. Static validation of Docker Compose is not evidence of successful container startup.

## Level-by-level record

### Level 0 — Foundation: partial

Implemented the uv workspace and Python 3.13 lock, core provider/storage/job contracts, API/embed/worker services, Next.js readiness shell, Dockerfiles, Compose, Makefile, and CI. The clean-clone report records 29 Python tests, two Vitest tests, static checks, readiness, persisted ping, and generated type checks passing. All six services were healthy in 22.1 seconds once images existed.

The cold first build plus startup took **402.2 seconds**, exceeding the strict 90-second target. The web dependency install took 83.9 seconds and Next.js build 79 seconds in that run. Checklist task `0.10` remains open. Evidence: [Level 0 report](../.agents/LEVEL_0_REPORT.md).

### Level 1 — Auth, notebooks, shell, and settings: complete

Implemented Better Auth email/password and optional social providers, JWT/JWKS bridge, protected web routes, user-owned notebook CRUD, encrypted provider settings, model picker/test connection, workspace shell, theme, toasts, and loading states. Recorded verification includes 34 Python tests, two web tests, production build, local Compose health/migration, and three Playwright journeys covering signup/signin, notebook creation, settings, theme, signout, and protected redirect. Evidence: [progress record](../.agents/PROGRESS.md#L24).

### Level 2 — Ingestion and embeddings: complete

Implemented the text-only EmbeddingGemma 2 embed service, persistent model cache, fake test backend, source/chunk schema and indexes, extractors, exact-offset chunking, SSRF-safe fetch, idempotent worker stages, reindexing, ownership checks, SSE, and source UI. ADR-005 records model/dependency choices.

The real CPU model ingested a 100-page PDF to `ready` in **213.4 s**, with 54 chunks and 2.64 GiB peak RSS. Python tests: 52 passed, one slow test skipped in default CI; local real-model ranking test passed. Five Playwright journeys, web checks, build, and Compose migration passed. Evidence: [Level 2 report](../.agents/LEVEL_2_REPORT.md).

### Level 3 — Grounded chat: complete

Implemented hybrid vector/full-text retrieval, rank fusion, grounded prompts, selected-source filtering, citation validation, chat persistence, SSE streaming, history, and offline evaluation. The 15-question local evaluation scored **100% hit-rate@8 and citation validity**. Six Playwright journeys and provider/security tests passed.

The live OpenRouter synthetic 100-page first-token run measured **2.346 s**, meeting the `<3 s` target. Evidence: [Level 3 report](../.agents/LEVEL_3_REPORT.md).

### Level 4 — Source viewer: complete

Implemented owned source content and expiring user-bound PDF URLs; virtualized PDF/Text viewer; offset and fuzzy-match citation highlighting; fallback passage card; citation navigation; rename/details controls. The report records 20 citation samples meeting the PDF/Text thresholds, 300-page PDF navigation with fewer than 10 pages mounted, cached reopen under 500 ms, and expired/other-user URL checks. Eight Playwright journeys and static/build checks passed. Evidence: [progress record](../.agents/PROGRESS.md#L29); ADR-007 in [decisions](DECISIONS.md).

### Level 5 — Guides and notes: complete

Implemented cached map-reduce source guides, debounced notebook overviews, notes CRUD, saved citations, note-to-source conversion, Tiptap editing, and Markdown export. A live guide completed in **20.8 s** against the 60 s target. Python tests: 67 passed and one slow test skipped; nine deterministic Playwright journeys and a separate live timing journey passed. Evidence: [Level 5 report](../.agents/LEVEL_5_REPORT.md).

### Level 6 — Text study artifacts: complete

Implemented five registered artifact recipes, structured output validation and one repair retry, citation validation, jobs/progress, owned artifact routes, cited viewer, Markdown/DOCX export, print-PDF path, and recipe-authoring skill. Python 3.13 package checks, all-recipe fake generation, exports, and Playwright generation/citation journey passed. WeasyPrint native dependencies were unavailable on Windows, so the documented print stylesheet is the PDF route. Evidence: [Level 6 report](../.agents/LEVEL_6_REPORT.md).

### Level 7 — Interactive study artifacts: complete

Implemented validated mind map, flashcard, and quiz recipes; React Flow viewer and node-to-chat; persisted Leitner progress and quiz attempts; PNG/SVG/Anki CSV exports. Python regression recorded 86 passed and one slow skipped; three Playwright interaction journeys passed. Ten generated quiz questions were manually checked against their source. Evidence: [Level 7 report](../.agents/LEVEL_7_REPORT.md).

### Level 8 — Audio overview: complete

Kokoro is isolated in a Python 3.12 service because its package does not support Python 3.13; ADR-011 records this. Implemented Kokoro/OpenAI/Fake TTS, grounded two-host scripts, faithfulness filtering, ffmpeg stitching, storage, cancellation, concurrency lease, and synchronized audio UI. Python recorded 92 passed/one slow skipped; FakeTTS browser journey and service health checks passed. Full live Kokoro inference was not part of the fake-provider e2e. Evidence: [Level 8 report](../.agents/LEVEL_8_REPORT.md).

### Level 9 — Advanced sources and sharing: partial

Pass A implemented transcript-first YouTube ingestion with Whisper fallback, audio uploads and time-anchored citations, discovery with SSRF-revalidated import, hashed/revocable read-only shares, rate limits, and ZIP export. Python 3.13 install/import checks passed for faster-whisper, yt-dlp, and youtube-transcript-api. Pass B multimodal retrieval and figure citations are implemented and recorded in ADR-006. Focused Pass A/C tests passed (**9 tests**).

Pass C remains open because the full discover/share Playwright/security journey has not run against a live Docker stack. In particular, runtime verification of share/revoke, visitor isolation, and browser import remains outstanding. Evidence: [Pass A report](../.agents/LEVEL_9A_REPORT.md), [task checklist](../.agents/TASKS.md), and [progress log](../.agents/PROGRESS.md#L45).

### Level 10 — Hardening, evals, and scale: partial

**Pass 1:** Expanded evaluations, faithfulness, tuning experiments, and OpenRouter model comparison are implemented. On 30 fixture questions, Gemini 3.1 Flash Lite scored 100% on hit-rate@8, citation validity, faithfulness, and answer relevance at an estimated $0.009977; DeepSeek V4 Flash scored 100%, 100%, 90%, and 100% at an estimated $0.002867. Cost uses catalog pricing and a workload approximation, not billed usage. ADR-012 records this.

**Pass 2:** Retries/backoff, dead-letter visibility, timeouts/fallbacks, caches, graceful shutdown, backup, and cleanup are implemented. Reliability/cache tests and local static checks passed. Live PostgreSQL EXPLAIN/query-plan review and container recovery behavior remain unverified. See ADR-013.

**Pass 3:** Authorization sweep, Better Auth hardening, security headers, admin controls, quotas, cost records, and audit automation are implemented. Python, Web, and Gitleaks CI passed on pushed commit `133db02`; root workspace and isolated Python 3.12 TTS locked dependency audits passed. See ADR-014.

**Pass 4:** Scale Compose, three web and three API replicas, MinIO, Nginx proxies, k6 profile, scaling/VPS docs, sample notebook, and axe tests are implemented. `docker compose -f docker-compose.yml -f docker-compose.scale.yml config -q` passed static validation. The public/sign-in axe checks found no critical issues.

Still open: 10-minute five-user k6, full scale-stack browser e2e, workspace axe, live EXPLAIN/recovery checks, and VPS deployment/TLS/backup/restore rehearsal. Docker Desktop could not be started in this session, `k6` is absent, and no VPS target is configured. Evidence: [Level 10 report](../.agents/LEVEL_10_REPORT.md), [scaling guide](SCALING.md), [Level 10 specification](levels/LEVEL_10_hardening_scale.md).

## Cross-level verification snapshot

The completion pass recorded **112 Python tests passed, 1 skipped**, Ruff and mypy passing (tests excluded from mypy because boto3 stubs are unavailable), web TypeScript passing, ESLint passing with three existing warnings, and **6 Vitest tests passing**. Level 9 focused tests recorded nine passes. Level 10 CI at `133db02` passed Python, Web, and Gitleaks. These are level-specific and cross-level runs and must not be added together as a unique test total.

Scale Compose syntax passed; Docker-backed runtime gates did not run. The final local record explicitly does not claim full acceptance for Levels 0, 9, or 10.

## Remaining work to reach full completion

1. Resolve or formally revise Level 0's strict cold-build target, then measure from a clean clone.
2. Run Level 9 Pass C's discover/share browser suite and full live ownership/revocation security checks.
3. On a Docker-enabled host, run Level 10's five-user, 10-minute k6 scenario, scaled full e2e, workspace axe, live query-plan review, and worker/database recovery checks.
4. Complete a real VPS deployment, TLS, backup, and restore rehearsal.
5. Update [`.agents/TASKS.md`](../.agents/TASKS.md), this report, and the per-level reports with measured results; only then mark the remaining levels complete.

## Detailed source records

- [Task checklist](../.agents/TASKS.md)
- [Progress log](../.agents/PROGRESS.md)
- [Level 0 report](../.agents/LEVEL_0_REPORT.md)
- [Level 2 report](../.agents/LEVEL_2_REPORT.md)
- [Level 3 report](../.agents/LEVEL_3_REPORT.md)
- [Level 5 report](../.agents/LEVEL_5_REPORT.md)
- [Level 6 report](../.agents/LEVEL_6_REPORT.md)
- [Level 7 report](../.agents/LEVEL_7_REPORT.md)
- [Level 8 report](../.agents/LEVEL_8_REPORT.md)
- [Level 9 Pass A report](../.agents/LEVEL_9A_REPORT.md)
- [Level 10 report](../.agents/LEVEL_10_REPORT.md)
- [Decision records](DECISIONS.md)
- [Scaling guide](SCALING.md)
