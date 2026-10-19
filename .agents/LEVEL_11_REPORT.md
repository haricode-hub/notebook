# Level 11 — Close the Open Gates

**Branch:** `level-11-close-open-gates`  
**Status:** In progress; only task 11.1 is complete in this run.  
**Rule:** Entries are measured only when their command was run. Fake-backend results must be labeled as fake. No acceptance criterion has been changed.

## Gate evidence

| Gate | Command | Measured value / result | Pass/fail | Runner |
|---|---|---|---|---|
| 11.1 Linux proof-runner decision | Review `docs/DECISIONS.md` ADR-016 | GitHub Actions `ubuntu-latest` selected; no Level 0 threshold changed | PASS (decision recorded) | Windows workspace review |
| 11.1 Windows dev target listing | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev.ps1 -Target list` | 12 Makefile targets listed | PASS | Windows PowerShell |
| 11.1 PowerShell syntax | `[System.Management.Automation.Language.Parser]::ParseFile` on `scripts/dev.ps1` and `scripts/loop.ps1` | 2 files parsed; 0 syntax errors | PASS | Windows PowerShell |
| 11.1 one-task loop dry run | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/loop.ps1 -Task 11.2 -WhatIf` | Printed a prompt scoped to task 11.2; did not launch Codex | PASS (dry run) | Windows PowerShell |
| 11.2 Fake-backend Playwright CI | Pending task 11.2 | Not run | NOT RUN | Pending Linux CI |
| 11.3 Level 0 build measurements | Pending task 11.3 | Not run; prior recorded cold build 402.2 s, warm start 22.1 s | NOT RUN | Pending Linux CI |
| 11.4 Level 9 Pass C | Pending task 11.4 | Not run | NOT RUN | Pending Linux CI |
| 11.5 Scale runtime suite | Pending task 11.5 | Not run | NOT RUN | Pending Linux CI |
| 11.6 VPS rehearsal | Pending task 11.6 | No target configured; runbook/rehearsal not yet completed | NOT RUN | Not available |
| 11.7 Hygiene | Pending task 11.7 | Not run | NOT RUN | Pending |

## Task 11.1 result

ADR-016 selects GitHub Actions `ubuntu-latest` as the runtime proof runner because the local Windows Docker service cannot be started in this workspace. This records where later runtime measurements should occur; it is not evidence that those checks passed. The original Level 0 cold-build criterion remains unchanged. Changing it requires a separate ADR and explicit user approval.

Added `scripts/dev.ps1` for all 12 Makefile targets and `scripts/loop.ps1`, which accepts one Level 11 task per invocation. The loop script has a `-WhatIf` mode and does not bypass approvals.

## Required input not present

The user-provided instruction references `AGENTS_ADDENDUM.md` at the repository root, but that file is absent from the checkout and is not in `.agents.zip`. The gap analysis exists at `docs/levels/00_STATUS_AND_GAP_ANALYSIS.md` and was read. Remaining tasks should be checked against the addendum if it is supplied.

## Remaining work

Follow `.agents/TASKS.md` in order, one unchecked Level 11 task per run. Do not emit `<promise>L11_COMPLETE</promise>` until every required gate has measured green evidence or a user-approved blocked reason.
