# Level 14 report (in progress)

Branch: `level-14-apple-design-ui`  
Date: 2026-10-20  
Status: **PARTIAL — passes 3–8 and the required Level 11.2 CI prerequisite are open.**

## Work completed

- Installed `motion@14.4.0` and locked it in `pnpm-lock.yaml`.
- Installed and read `.agents/skills/apple-design/SKILL.md`. The optional `improve-animations`, `better-ui`, and `frontend-design` skills were not present. The skill's exact concrete-question answer is recorded in [ADR-015](../../docs/DECISIONS.md).
- Added light/dark design tokens, typography and spacing tokens, material tiers and preference fallbacks, Motion spring presets, `useMotionPrefs()`, and a shared `Material` component.
- Added immediate pointerdown scale feedback, reduced-motion opacity feedback, visible focus outlines, and a 44 px minimum height for buttons and role buttons.
- Added Playwright coverage for the auth screen, screenshots, keyboard focus, target size, and pointerdown response.

## Evidence

| Gate | Command | Measured value | Result | Runner/backend |
|---|---|---:|---|---|
| Install/read apple-design | `npx.cmd --yes skills add https://github.com/emilkowalski/skills --skill apple-design --agent codex`; `Get-Content .agents/skills/apple-design/SKILL.md` | exit 0; installed skill read | PASS | Local |
| Level 11.2 prerequisite (e2e in CI) | Inspect `.github/workflows` and `rg -n 'playwright|e2e' .github/workflows` | No Playwright e2e workflow found; Level 11.2 remains unchecked | BLOCKED | Local |
| Foundations unit suite | `corepack pnpm --filter web test` | 5 files, 11 tests passed | PASS | Local; deterministic |
| TypeScript | `corepack pnpm --filter web typecheck` | exit 0 | PASS | Local |
| ESLint | `corepack pnpm --filter web lint` | exit 0; 3 existing warnings in chat-panel, pdf-original, source-viewer | PASS with warnings | Local |
| Auth screenshots, Pass 1 | `LEVEL14_SCREENSHOT_STAGE=before-pass1/after-pass1 corepack pnpm --filter web exec playwright test e2e/level14-visual.spec.ts --grep 'auth baseline'` | 4 screenshots per checkpoint, each passed at 1440×1000 / 390×844, light / dark | PASS | Local; auth UI only |
| Auth screenshots and interaction, Pass 2 | `LEVEL14_SCREENSHOT_STAGE=after-pass2 corepack pnpm --filter web exec playwright test e2e/level14-visual.spec.ts` | 5 tests passed; pointerdown response **5.30 ms**, sampled scale **0.970**; target >=44 px and keyboard focus visible | PASS | Local; auth UI only |
| Production build | `corepack pnpm --filter web build` | Compilation succeeded; prerender failed at `/reset-password` because `useSearchParams()` is outside a Suspense boundary | FAIL (existing route issue) | Local |
| Motion bundle size | Not yet measured; no screen currently imports Motion | No measurement | OPEN | Local |
| Undo and purge | Not implemented | No API or lifecycle measurement | OPEN | — |
| Existing signed-in end-to-end journeys | Requires DB/API/worker services; Docker daemon access denied | Not run | BLOCKED | Local |

Screenshot files are in [`docs/levels/level14/screenshots`](../../docs/levels/level14/screenshots). The 12 PNGs total 247,823 bytes. Before-Pass-1 images use the committed baseline stylesheet; after-Pass-1 and after-Pass-2 screenshots show the auth page at all four required viewport/theme combinations.

## Known weaknesses and open work

- Level 11 task 11.2 is a stated Level 14 prerequisite and is not complete. Its CI workflow must be closed in the correct level before Level 14 can be declared complete.
- This report covers the first two passes only. Workspace soft delete/undo, chat/source/artifact interactions, settings/auth polish, design lab, preference emulation, axe, long-frame/CLS/INP checks, visual regression, full e2e, and API tests remain unrun.
- No screen yet uses the installed Motion package; the 60 KB gzipped motion-layer budget has not been measured.
- Local auth screenshots produce a hydration warning because the installed Chrome environment injects `style="caret-color:transparent"` into form inputs. The page still rendered and all screenshot assertions passed; a clean browser profile is needed to distinguish extension injection from app behavior.
- The existing `/reset-password` page currently fails production prerender due to `useSearchParams()` outside Suspense. This surfaced during Level 14 build verification and is queued for the auth/settings pass.
- Docker daemon access from this session fails with a Windows named-pipe access-denied error. No Level 14 API or full-stack acceptance result is inferred from the web-only run.

## Deliberate rule deviations

None. No transition was added to non-transform/opacity properties; the first two passes do not introduce first-paint animation or autoplay.
