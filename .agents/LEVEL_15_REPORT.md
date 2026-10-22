# Level 15 — Design system and UI rework

Date: 2026-10-22  
Branch: `level-15-framer-inspired-ui`  
Design source: repository-root `DESIGN.md`  
Status: implementation and requested visual checks complete; changes remain uncommitted.

## Result

Reworked the app to follow the warm editorial system in `DESIGN.md`: paper-toned semantic surfaces, Source Serif 4 editorial headings, Geist UI text, Geist Mono metadata, restrained rust accent, standardized lucide wrapper, and consistent form/feedback primitives. Existing API calls and product state flows were preserved. The workspace adapts to three-pane desktop, chat plus one switchable side pane on tablets, and bottom tabs on phones. Added a command menu, plus keyboard and focus behavior for dialogs.

## Visual evidence

The Playwright capture flow wrote 48 screenshots to [`docs/design/current/`](../docs/design/current/). Each main screen and the primitive showcase was captured in light and dark modes at 375, 768, 1280, and 1680 px. Screenshots include workspace, chat with citations, source viewer, Studio, settings, and design primitives. The chat answer is a **FAKE screenshot fixture**; screenshots confirm layout and citation navigation, not model quality.

See the inventory and before/after summary in [`docs/design/AUDIT.md`](../docs/design/AUDIT.md).

## Measured checks

| Gate | Command / path | Measured result | Status | Runner |
|---|---|---:|---|---|
| Semantic design audit | `corepack pnpm lint:design` | 71 source files scanned; no banned palette utilities, raw colors, gradients, blur utilities, arbitrary sizes, unwrapped JSX icons, or missing theme/font tokens | PASS | Windows local |
| Web typecheck | `corepack pnpm --filter web typecheck` | Exit 0 | PASS | Windows local |
| Web lint | `corepack pnpm --filter web lint` | Exit 0; 0 errors, 2 existing TanStack Virtual compatibility warnings | PASS | Windows local |
| Web unit tests | `corepack pnpm --filter web test` | 8 files, 21 tests passed | PASS | Windows local |
| Production image build | `docker compose build web` | Next.js production build completed and emitted all app routes, including `/design-preview` | PASS | Docker Desktop |
| Web container smoke | `docker compose up -d --no-deps web`; `curl http://localhost:3000/` | Container healthy; HTTP 200 | PASS | Docker Desktop |
| Browser screenshot and citation flow | `node e2e/level15-capture.mjs` | 48 screenshots; source citation opened viewer with highlighted text; Settings loaded; Ctrl+K opened the command menu; command/design dialogs dismissed with Escape; 0 browser console/page errors | PASS (FAKE chat answer) | Chrome + Docker |
| Follow-up visual fixes | browser computed style + `node apps/web/e2e/level15-capture.mjs` | Primary button foreground is white over terracotta; composer source menu is wired to source selection; disabled send uses sunken/disabled tokens; regenerated 48 screenshots in repo path | PASS (FAKE chat answer) | Chrome + Docker |
| Pane, form, and header refinement | `corepack pnpm --filter web typecheck`, `corepack pnpm --filter web test`, `corepack pnpm --filter web lint`, `corepack pnpm lint:design`, production build, screenshot flow | Sources/Chat/Studio default split 18/54/28; Sources toolbar fits at 1280 px; all 21 tests pass; 72 files audited; 48 browser screenshots regenerated at 375/768/1280/1680 in light and dark modes | PASS (FAKE chat answer) | Windows local + Docker + Chrome |

The image build logs Better Auth's expected build-time warning about missing `BETTER_AUTH_SECRET` during static generation; the build completed, and the compose runtime uses the project environment.

## Files and component changes

- Added semantic token mappings and responsive layout helpers in `apps/web/src/app/globals.css` and `apps/web/tailwind.config.ts`; loaded all three required fonts through `next/font`. Pane headings use medium weight; the workspace now gives Sources 18%, Chat 54%, and Studio 28% by default.
- Added the `Icon` wrapper, `cn`, reusable form, navigation, dialog, feedback, badge, menu, tooltip, and material primitives.
- Reworked auth, notebook list, workspace, source list/viewer, chat, settings, admin, Studio, notes, audio, mind map, quiz, flashcards, and shared notebook surfaces to use semantic tokens. Audio speed, PDF page navigation, and standard forms now share the same field primitives; persona and response length live in notebook Preferences rather than the workspace header.
- Added `/design-preview` and `scripts/design-audit.mjs`; exposed it as both `lint:design` and `design:audit`.
- Removed unused `apps/web/src/design/tokens.css`, which contained an obsolete theme.
- Added current screenshots and route/component mapping in `docs/design/`.

## Known weaknesses / limits

- The full older Playwright suite was not rerun in this pass; prior Level 15 results document legacy failures and remain open. The dedicated current UI capture flow passed.
- The two lint warnings are the existing TanStack Virtual APIs in the PDF and source virtualized readers; React Compiler skips memoization at those calls.
- The capture answer uses a FAKE fixture. No live LLM quality or provider behavior is inferred from it.
- The visual matrix is measured, but final design approval still belongs to a human reviewing the screenshots.

No tokens outside `DESIGN.md` were added. No deliberate visual rule violations are recorded.
