# Level 14 report (in progress)

Branch: `level-14-apple-design-ui`  
Date: 2026-10-20  
Status: **PARTIAL — Pass 3 desktop panel physics and passes 4–8 are open; the required Level 11.2 CI prerequisite is also open.**

## Work completed

- Installed `motion@14.4.0` and locked it in `pnpm-lock.yaml`.
- Installed and read `.agents/skills/apple-design/SKILL.md`. The optional `improve-animations`, `better-ui`, and `frontend-design` skills were not present. The skill's exact concrete-question answer is recorded in [ADR-015](../../docs/DECISIONS.md).
- Added light/dark design tokens, typography and spacing tokens, material tiers and preference fallbacks, Motion spring presets, `useMotionPrefs()`, and a shared `Material` component.
- Added immediate pointerdown scale feedback, reduced-motion opacity feedback, visible focus outlines, and a 44 px minimum height for buttons and role buttons.
- Added Playwright coverage for the auth screen, screenshots, keyboard focus, target size, and pointerdown response.
- Added a mobile Chat-first workspace with draggable Sources/Studio sheets and bottom tabs. Added owned notebook soft delete/restore, a 30-second undo window, and worker file/database purge on a 15-second sweep.

## Evidence

| Gate | Command | Measured value | Result | Runner/backend |
|---|---|---:|---|---|
| Install/read apple-design | `npx.cmd --yes skills add https://github.com/emilkowalski/skills --skill apple-design --agent codex`; `Get-Content .agents/skills/apple-design/SKILL.md` | exit 0; installed skill read | PASS | Local |
| Level 11.2 prerequisite (e2e in CI) | Inspect `.github/workflows` and `rg -n 'playwright|e2e' .github/workflows` | No Playwright e2e workflow found; Level 11.2 remains unchecked | BLOCKED | Local |
| Foundations unit suite | `corepack pnpm --filter web test` | 5 files, 11 tests passed | PASS | Local; deterministic |
| TypeScript | `corepack pnpm --filter web typecheck` | exit 0 | PASS | Local |
| ESLint | `corepack pnpm --filter web lint` | exit 0; 2 pre-existing warnings in pdf-original and source-viewer | PASS with warnings | Local |
| Auth screenshots, Pass 1 | `LEVEL14_SCREENSHOT_STAGE=before-pass1/after-pass1 corepack pnpm --filter web exec playwright test e2e/level14-visual.spec.ts --grep 'auth baseline'` | 4 screenshots per checkpoint, each passed at 1440×1000 / 390×844, light / dark | PASS | Local; auth UI only |
| Auth screenshots and interaction, Pass 2 | `LEVEL14_SCREENSHOT_STAGE=after-pass2 corepack pnpm --filter web exec playwright test e2e/level14-visual.spec.ts` | 5 tests passed; pointerdown response **5.30 ms**, sampled scale **0.970**; target >=44 px and keyboard focus visible | PASS | Local; auth UI only |
| Undo API and delayed purge | `.venv/Scripts/python.exe -m pytest tests/test_level14_soft_delete.py -q -p no:cacheprovider` | 3 passed: owner-only restore, expired restore 410, expired notebook + file purged while recent notebook + file remained | PASS | Local; SQLite + MemoryStorage (FAKE storage) |
| Pass 3 auth screenshots | `LEVEL14_SCREENSHOT_STAGE=after-pass3 corepack pnpm --filter web exec playwright test e2e/level14-visual.spec.ts --grep 'auth baseline'` | 4 screenshots passed at 1440×1000 / 390×844, light / dark | PASS | Local; auth UI only |
| Focused Python lint/types | `.venv/Scripts/python.exe -m ruff check apps/api/src/opennotebook_api/routers/notebooks.py apps/api/src/opennotebook_api/routers/account.py apps/api/src/opennotebook_api/routers/sharing.py apps/worker/src/opennotebook_worker/main.py packages/core/src/opennotebook_core/models.py packages/core/src/opennotebook_core/config.py packages/core/alembic/versions/0011_notebook_soft_delete.py tests/test_level14_soft_delete.py`; `.venv/Scripts/python.exe -m mypy apps/api/src/opennotebook_api/routers/notebooks.py apps/worker/src/opennotebook_worker/main.py` | Ruff clean; mypy: 2 files, no issues | PASS | Local |
| Production build | `corepack pnpm --filter web build` | Compilation succeeded; prerender failed at `/reset-password` because `useSearchParams()` is outside a Suspense boundary | FAIL (existing route issue) | Local |
| Motion bundle size | Not yet measured; no screen currently imports Motion | No measurement | OPEN | Local |
| Undo and purge | Not implemented | No API or lifecycle measurement | OPEN | — |
| Existing signed-in end-to-end journeys | Requires DB/API/worker services; Docker daemon access denied | Not run | BLOCKED | Local |

Screenshot files are in [`docs/levels/level14/screenshots`](../../docs/levels/level14/screenshots). The screenshot set contains 28 PNGs across captured checkpoints; Pass 4 before/after screenshots show auth only, not the signed-in chat. Before-Pass-1 images use the committed baseline stylesheet; completed checkpoints have screenshots at all four required viewport/theme combinations. Pass 3 screenshots cover the auth UI; the local sign-in flow is available without API/DB services.

## Known weaknesses and open work

- Level 11 task 11.2 is a stated Level 14 prerequisite and is not complete. Its CI workflow must be closed in the correct level before Level 14 can be declared complete.
- Pass 4 chat composer, edge fades, and streaming scroll behavior are implemented; citation click transitions and signed-in visual evidence remain open. Passes 5–8 remain open: viewer transitions, Studio polish, settings/auth and design lab, reduced preference validation, axe, long-frame/CLS/INP, visual regression, and full journeys.
- The Motion-driven mobile sheet is implemented, but desktop panel rubber-band/momentum snap is still missing. Motion is now imported by the workspace route; the 60 KB gzipped motion-layer budget has not been measured.
- Local auth screenshots produce a hydration warning because the installed Chrome environment injects `style="caret-color:transparent"` into form inputs. The page still rendered and all screenshot assertions passed; a clean browser profile is needed to distinguish extension injection from app behavior.
- The existing `/reset-password` page currently fails production prerender due to `useSearchParams()` outside Suspense. This surfaced during Level 14 build verification and is queued for the auth/settings pass.
- The undo API and purge job are verified with SQLite and `MemoryStorage` (FAKE); PostgreSQL cascade behavior and real LocalDisk/S3 deletion have not run in this environment.
- Docker daemon access from this session fails with a Windows named-pipe access-denied error. No Level 14 API or full-stack acceptance result is inferred from the web-only run.

## Deliberate rule deviations

None. No transition was added to non-transform/opacity properties; the first two passes do not introduce first-paint animation or autoplay.
