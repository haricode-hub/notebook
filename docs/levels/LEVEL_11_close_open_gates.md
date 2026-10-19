# LEVEL 11: Close the Open Gates

Prerequisite: `AGENTS.md` + `AGENTS_ADDENDUM.md`; Levels 0-10 implemented (this level proves them).

## Feature name
Runtime proof: working Linux environment, e2e in CI, Level 0 decision, Level 9 Pass C, Level 10 runtime gates, reports and release hygiene.

## Objectives and goals
- Turn "implemented" into "proven" for every open item in `00_STATUS_AND_GAP_ANALYSIS.md`.
- Make CI the safety net before any UI redesign.
- Never edit an acceptance criterion silently: any change goes through an ADR and the user.

## Scope
1. **Working Linux runtime.** Pick one and record it in an ADR: (a) WSL2 + Docker Engine inside WSL (or fix Docker Desktop's `com.docker.service`), (b) a devcontainer, or (c) GitHub Actions `ubuntu-latest` as the proof runner. Provide `scripts/dev.ps1` equivalents for `make` targets for Windows, and a PowerShell `loop.ps1`.
2. **Level 0 cold build.** Add BuildKit cache mounts for uv and pnpm, split dependency layers from source layers, publish images to GHCR from CI, and measure: warm start, cold build on CI, pull-and-start. Apply the user's decision (Option A or B in the gap analysis). Update `LEVEL_0_REPORT.md` with measured numbers.
3. **E2E in CI.** A workflow that builds Compose with fake embed/LLM/TTS backends, runs Playwright (all journeys), uploads traces on failure. Remove the single-worker restriction by disabling or isolating rate limits in the test environment (per-test users, test-only config), not by weakening production limits.
4. **Level 9 Pass C.** Browser + security tests: create/revoke share link (revoked link fails instantly; visitor cannot write or reach other notebooks), discover then import (private-IP result rejected), export ZIP contents, time-anchored citation opens the right segment, multimodal flag on/off behavior, merge function uses ranks not raw cross-modal scores. Record 20-min YouTube and 10-min audio measurements (from a real run or a clearly labeled fixture).
5. **Level 10 runtime gates**, run in CI on Linux (`scale-acceptance.yml`, manual + nightly): scale Compose (3 web + 3 API + MinIO + proxy) with fake embed; full e2e through the proxy including sign-in across replicas and S3-backed files; k6 5 VUs x 10 minutes with 5 isolated accounts (error rate, first-token p95, memory, queue drain); signed-in workspace axe scan; EXPLAIN plans for retrieval, list and history queries; kill-worker-mid-ingestion recovery test; non-admin blocked from admin API and page; fallback-model live test (force primary failure, answer still streams); backup then restore rehearsal.
6. **VPS rehearsal** (when a target exists): fresh clone, TLS via Caddy/Traefik, backup/restore, timed from zero. If no target yet, write the exact runbook and mark the gate BLOCKED with the reason.
7. **Hygiene.** Missing reports (`LEVEL_1`, `LEVEL_4`, `LEVEL_9B`, `LEVEL_9C`, `FINAL_REPORT.md`), merge level branches to `main` through PRs with required CI, tag `level-0` ... `level-10`, add `types-boto3` and put mypy on tests, fix or justify the 3 React Compiler warnings, refresh `.agents/LOOP_PROMPT.md`.

## Agent Prompt
```
Read AGENTS.md, AGENTS_ADDENDUM.md, docs/levels/LEVEL_11_close_open_gates.md and 00_STATUS_AND_GAP_ANALYSIS.md. Execute LEVEL 11 only.
Rules: never claim a gate passed without measured evidence in a report; never change an acceptance criterion without an ADR and explicit user approval; label fake-backend results as such.
Order: (1) runtime decision + dev scripts, (2) e2e-in-CI workflow with fake backends, (3) Level 0 cold-build work and report, (4) Level 9 Pass C tests and measurements, (5) scale-acceptance workflow with k6/axe/EXPLAIN/recovery/admin/fallback/backup tests, (6) VPS runbook (and rehearsal if a target exists), (7) hygiene tasks.
Create .agents/TASKS.md section "Level 11" with one task per numbered scope item, then work one task per run. Write results to .agents/LEVEL_11_REPORT.md including a table: gate, command, measured value, pass/fail, runner.
Output <promise>L11_COMPLETE</promise> only if every gate is measured and green or explicitly marked BLOCKED with a user-approved reason.
```

## Task checklist
- [ ] 11.1 Runtime decision ADR + Windows scripts (`dev.ps1`, `loop.ps1`)
- [ ] 11.2 E2E-in-CI workflow with fake backends, traces on failure, parallelizable tests
- [ ] 11.3 Level 0 cold-build optimization, GHCR images, updated report
- [ ] 11.4 Level 9 Pass C tests (share, discover, export, time citation, multimodal flag)
- [ ] 11.5 Scale-acceptance workflow: e2e through proxy, cross-replica sign-in, S3 files
- [ ] 11.6 k6 5-user run recorded
- [ ] 11.7 Workspace axe, EXPLAIN plans, worker-kill recovery, admin gating, fallback test, backup/restore
- [ ] 11.8 VPS runbook (+ rehearsal)
- [ ] 11.9 Missing reports, branch merge, tags, mypy on tests, lint warnings, LOOP_PROMPT refresh

## Acceptance tests
1. A fresh Linux runner brings the stack up from a clean clone and CI e2e (all journeys) is green and required on `main`.
2. Warm start <= 90 s recorded; cold build time recorded with before/after numbers; the Level 0 decision is written into the Level 0 report.
3. Share revoke blocks within one request; visitors cannot mutate or enumerate other notebooks (automated).
4. k6: error rate < 1%, first-token p95 < 4 s (cloud model) or recorded and explained, no OOM, queue drains.
5. Scale stack: sign-in on replica A is valid on replica B; uploaded file readable from any API replica (S3).
6. Worker killed mid-ingestion then restarted: source reaches `ready`, zero duplicate chunks.
7. Fallback model: with the primary forced to fail, the answer streams from the fallback and is labeled.
8. Backup then restore into a fresh database passes a data-integrity check.
9. Axe on signed-in workspace: zero critical violations.
10. All level reports exist; `main` contains all levels; tags exist.

## Working condition
"Everything marked done has a number or a green CI run behind it, and I can merge a UI change without fear."
