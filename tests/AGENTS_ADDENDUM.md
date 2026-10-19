# AGENTS_ADDENDUM.md (append to AGENTS.md, or keep beside it and reference it)

These rules come from what the first build taught us. They apply to Levels 11-14 and every later change.

## Evidence rules
1. Never mark a gate passed without a measured value and the command that produced it. Reports use a table: gate, command, measured value, pass/fail, runner (local/CI), backend (real/FAKE).
2. Label fake-backend results as FAKE. A metric produced with FakeEmbedding, FakeLLM or FakeTTS is a test of plumbing, not of quality.
3. Never edit an acceptance criterion silently. Propose the change in an ADR, ask the user, then change it. Keep the old wording in the ADR.
4. Perfect scores (100%) on a small fixture are a warning sign. Add harder cases before celebrating.
5. If a gate cannot run (no Docker, no k6, no VPS), mark it BLOCKED with the exact reason and what is needed. Never mark it passed from static validation.

## Environment rules (Windows host)
- The primary developer machine is Windows. Prefer WSL2 or a devcontainer for Linux tooling. `make` may be missing: keep `scripts/dev.ps1` in sync with the Makefile targets.
- Do not rely on bash-only scripts at the repo root without a PowerShell equivalent.
- Docker daemon problems (`com.docker.service` stopped) must be reported early with the fix tried; do not spend a whole run retrying.
- Secrets: `.env` is never committed. If a key appears in any log, report, screenshot or trace, tell the user to rotate it.

## Git and release rules
- One branch per level, merged to `main` by PR with required CI; tag `level-N` after merge.
- CI must include: Python lint/types/tests, web lint/types/tests/build, Gitleaks, dependency audits, and (from Level 11) Playwright e2e with fake backends.

## UI rules (Level 14 and later UI changes)

- Follow the installed `apple-design` skill: feedback on pointer-down, 1:1 direct manipulation, interruptible spring-based motion, same-path enter/exit, materials for hierarchy, restraint.
- Animate only `transform` and `opacity` (blur only for the materialize effect).
- Every effect honors `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast`.
- Touch targets at least 44 px; visible focus rings; no layout shift while streaming.
- Prefer undo over confirmation dialogs for reversible actions.
- When invoking a design skill, always give it a concrete question or task; some skills reply with a fixed greeting otherwise.
- Third-party skills are instructions your agent will follow: read each SKILL.md before use and pin versions.

## Reporting rules
- Each level ends with `.agents/LEVEL_N_REPORT.md` containing: what changed, measured results table, known weaknesses, follow-ups.
- Update `.agents/TASKS.md` and `.agents/PROGRESS.md` after every task, with dates.