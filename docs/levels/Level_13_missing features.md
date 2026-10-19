# LEVEL 13: Missing Product Features

Prerequisite: Levels 11 and 12 complete. Level 14 may run before or after; if UI is already redone, new UI follows Level 14 rules.

## Feature name
Close the product gaps against NotebookLM and make accounts production-ready.

## Objectives and goals
- Accounts are safe and recoverable for real users.
- Fill the most visible feature gaps without changing the architecture.

## Scope (priority order, each is its own task group)
1. **Auth completeness (Better Auth):** password reset and email verification (SMTP provider via env, Mailpit in dev), change password/email, session list and revoke, delete account (cascade removal of notebooks, files, vectors, jobs) and data export (reuse notebook ZIP). Optional 2FA. Verify the options through Context7/official docs first.
2. **Command palette and keyboard shortcuts** (if not done in Level 14): navigation, new notebook, add source, focus chat, toggle panels, shortcut help dialog.
3. **Answer feedback loop:** thumbs up/down with reason on chat answers, stored per message, shown in the admin page and exported for the eval set.
4. **Notebook search:** search across sources, notes, chat and artifacts (Postgres FTS + the existing vector search), with results that open the right viewer.
5. **Slide deck artifact:** recipe producing structured slides (title, bullets, speaker notes, citations), HTML preview, export to PPTX (python-pptx) and PDF.
6. **Deep research mode (Discover v2):** a planner that makes several search queries, fetches and reads candidate pages through the SSRF-safe fetcher, produces a cited report with a source list, and lets the user import chosen sources. Hard limits on queries, pages, time and cost; progress via SSE.
7. **Source refresh and duplicate detection:** re-fetch a URL source, show "changed" status with diff size, skip identical content hashes, warn on duplicates.
8. **Google Drive/Docs import (optional):** Better Auth Google provider with the Drive read-only scope, picker, import as sources; token storage hardened.
9. **Multi-language:** UI strings extracted (next-intl or similar), output language already supported by artifacts: apply it consistently to chat via a notebook setting.
10. **Collaboration (stretch):** invite by email as viewer/editor, per-notebook roles enforced in the API, activity log. Only after authorization tests are extended to roles.

## Agent Prompt
```
Read AGENTS.md, AGENTS_ADDENDUM.md and docs/levels/LEVEL_13_missing_features.md. Execute LEVEL 13 only.
Work through scope items in the listed priority order, one item per run group, each with tests, an ADR when a choice is made, and an updated authorization sweep for every new route. For items 1, 8 and 10 first verify the current Better Auth APIs with Context7 or official docs and record findings.
Keep quotas and rate limits on every new expensive endpoint (deep research, slide generation). Never log secrets, tokens or email contents.
Write .agents/LEVEL_13_REPORT.md listing each item as DONE / PARTIAL / SKIPPED with evidence.
Output <promise>L13_COMPLETE</promise> when items 1-7 pass their acceptance tests and items 8-10 are done or explicitly deferred by the user.
```

## Task checklist
- [ ] 13.1 Password reset, verification, sessions, account delete, data export
- [ ] 13.2 Shortcuts and command palette
- [ ] 13.3 Answer feedback + admin view + eval export
- [ ] 13.4 Notebook search
- [ ] 13.5 Slide deck artifact (HTML, PPTX, PDF)
- [ ] 13.6 Deep research mode with limits
- [ ] 13.7 Source refresh + duplicate detection
- [ ] 13.8 Google Drive import (optional)
- [ ] 13.9 i18n + chat output language
- [ ] 13.10 Collaboration roles (stretch)

## Acceptance tests
1. Reset and verification emails work in dev (Mailpit); tokens expire and are single-use; account deletion removes every row, file and vector for that user (automated count check) and other users are untouched.
2. Authorization sweep covers all new routes; non-owner access returns 404/403.
3. Feedback is stored once per user per message and visible to admins only.
4. Notebook search returns results from all four content types and each opens the right place.
5. A 10-slide deck generates within 2 minutes, every slide cites sources, PPTX opens in PowerPoint/LibreOffice.
6. Deep research respects limits (max queries/pages/time), rejects private-IP pages, and produces a cited report; cost is logged.
7. Refreshing an unchanged URL does no re-embedding; changed content re-ingests atomically.
8. UI language switch changes all strings and chat output language.

## Working condition
"Real people can sign up, recover access, delete their data, and use search, slides and research without me touching the database."