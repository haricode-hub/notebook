# Level 13 Report

This report tracks the Level 13 priority items. Work is being done one task group per run; only 13.1 has been implemented in this run. Do not treat unrun items as complete. Level 11/12 prerequisites are still open in `.agents/TASKS.md` and are not re-certified here.

| Item | Status | Evidence |
|---|---|---|
| 13.1 Auth completeness | **PARTIAL** | Better Auth 1.7.6 email/password callbacks, SMTP delivery bridge, optional verification enforcement when SMTP is configured, password reset, email change, session list/revoke, password change, verified account-delete callback, scoped account ZIP export, per-route throttles, Mailpit dev profile, and internal API purge implemented. `tests/test_level13_account.py` plus `tests/test_level10_authorization_sweep.py`: **7 passed**; account purge test checks the notebook/source/vector cascade, files, jobs/settings, and preservation of a second user's rows/file. Internal SMTP behavior is **FAKE** in that test (mock transport). Full Python suite: **123 passed, 2 skipped**; Ruff passed; mypy passed across 43 source files. Web typecheck passed; ESLint passed with 3 warnings outside the new files; Vitest: **9 passed across 4 files**. `docker compose --profile dev-mail config --quiet`: exit 0 (Docker config-access warnings). No Mailpit message was sent; real reset/verification/change/delete expiry and one-time-use flows and Playwright remain unverified. Optional 2FA was not implemented. |
| 13.2 Command palette and shortcuts | **PARTIAL — not run** | Outside the 13.1 run group. |
| 13.3 Answer feedback loop | **PARTIAL — not run** | Outside the 13.1 run group. |
| 13.4 Notebook search | **PARTIAL — not run** | Outside the 13.1 run group. |
| 13.5 Slide deck artifact | **PARTIAL — not run** | Outside the 13.1 run group. |
| 13.6 Deep research mode | **PARTIAL — not run** | Outside the 13.1 run group. |
| 13.7 Source refresh and duplicate detection | **PARTIAL — not run** | Outside the 13.1 run group. |
| 13.8 Google Drive/Docs import | **PARTIAL — not run** | Outside the 13.1 run group; not deferred. |
| 13.9 Multi-language UI and chat output | **PARTIAL — not run** | Outside the 13.1 run group. |
| 13.10 Notebook collaboration | **PARTIAL — not run** | Outside the 13.1 run group; not deferred. |

## 13.1 implementation notes

- Better Auth server options were verified against official email/password, email, user/account, and session-management documentation and the installed 1.7.6 package; Context7 is unavailable in this session. Findings and the integration boundary are in [ADR-021](../docs/DECISIONS.md).
- `ACCOUNT_INTERNAL_TOKEN` must be set to the same generated secret in web and API. The internal email and account purge endpoints use constant-time bearer-token comparison; the normal account export requires the user's JWT. The API request logger records only method/path/status/duration, not request bodies.
- For local email, set `SMTP_HOST=mailpit` and start `docker compose --profile dev-mail up`; the Mailpit UI is at `http://localhost:8025`. With SMTP configured, new accounts require email verification. This Docker-backed flow was not executable as an end-to-end acceptance test in this run.
- Account export reuses the existing notebook export contents for each owned notebook (source text, notes, artifacts and citations). It does not include authentication secrets or provider API keys.

## Measured commands

| Command | Result | Runner |
|---|---|---|
| `.venv/Scripts/ruff.exe check ...` | pass | Windows workspace |
| `.venv/Scripts/mypy.exe apps/api/src/opennotebook_api/routers/account.py apps/api/src/opennotebook_api/main.py` | pass, no issues in 2 source files | Windows workspace |
| `.venv/Scripts/pytest.exe -q -p no:cacheprovider --basetemp %TEMP%/pytest-l13-account-3 tests/test_level13_account.py tests/test_level10_authorization_sweep.py` | **7 passed**, 1 upstream Starlette deprecation warning | Windows workspace |
| `.venv/Scripts/pytest.exe -q -p no:cacheprovider --basetemp %TEMP%/pytest-l13-all` | **123 passed, 2 skipped**, 1 upstream Starlette deprecation warning | Windows workspace |
| `corepack pnpm --filter web typecheck` | pass | Windows workspace |
| `corepack pnpm --filter web lint` | pass | Windows workspace |
| `corepack pnpm --filter web test` | **9 passed, 4 files** | Windows workspace |
| `docker compose --profile dev-mail config --quiet` | exit 0; Docker config file access warnings | Windows workspace; configuration only, no containers started |
| `git diff --check` | pass | Windows workspace |
