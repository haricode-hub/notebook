# LEVEL 14: Apple-Style UI Overhaul (fluid, physical, restrained)

Prerequisite: Level 11 task 11.2 done (Playwright e2e runs in CI). Levels 0-10 working.

## Feature name
A UI pass based on the `apple-design` skill by Emil Kowalski (https://www.ui-skills.com/skills/emilkowalski/apple-design), applied to every screen of the NotebookLM clone.

## What the skill teaches (the rules we apply)
Response (feedback on pointer-down, zero needless latency), direct 1:1 manipulation, interruptible animation (animate from the live value, never lock input), springs instead of fixed-duration tweens (default damping 1.0, bounce only after momentum), velocity handoff, momentum projection, spatial consistency (enter and exit on the same path, origin anchored to the trigger), rubber-banding, translucent materials for hierarchy, size-specific typography, reduced motion / transparency / contrast, and the principles: purpose, agency (undo over confirm dialogs), familiarity, simplicity, craft, restraint.

## Objectives and goals
- The app feels like an extension of the user's hand, not a web form.
- Motion is physical and interruptible, never decorative.
- Every effect has an accessible fallback (reduced motion, reduced transparency, more contrast).
- No regression in speed, accessibility or e2e journeys.

## Setup (once)
1. Install the skill and related ones (review each SKILL.md before trusting it, since third-party skills are instructions your agent will follow):
   `npx skills add https://github.com/emilkowalski/skills --skill apple-design`
   Related skills listed on the same page that are worth adding: `improve-animations` and `animation-vocabulary` (emilkowalski), `better-ui` (jakubkrehel), `interaction-design` (wshobson). Keep `frontend-design` from `anthropics/skills`.
2. Confirm where the CLI put them (for example `.claude/skills/` or `.agents/skills/`) and make sure the agent you use can read that folder (for Codex, reference them from `AGENTS.md`).
3. Note: the skill replies with a fixed greeting if invoked without a concrete question, so every prompt below asks a specific question or task.
4. Add the `motion` package (Motion / Framer Motion successor) and optionally `vaul` for mobile sheets.

## Scope (screen by screen)

### 1. Foundations (design tokens)
- `src/design/tokens.css` + `tokens.ts`: color tokens (light/dark), radii, spacing in `rem`, elevation, **material tokens** (thin/regular/thick: blur radius, saturation, background alpha, top-edge highlight), z-layers.
- **Typography:** system font stack first (it ships optical sizing and tracking tables); size-specific letter-spacing (about -0.02em for large display, near 0 for body, slightly positive for small), leading tight on headings and looser on body, `text-wrap: balance` on headings, `font-variant-numeric: tabular-nums` for counters, timestamps and quiz scores, `rem`-based layout so browser text-size settings scale the layout.
- **Spring tokens** in `src/design/springs.ts`: `default` (damping 1.0, response about 0.35), `momentum` (damping about 0.8), `sheet` (0.8 / 0.3), `move` (1.0 / 0.4); one helper to convert (damping, response) to the Motion spring options.
- **Accessibility tokens:** `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast: more`, all handled in one place (a `useMotionPrefs()` hook + CSS custom properties) so components cannot forget them.

### 2. Global interaction layer
- **Press feedback on pointer-down** for all buttons, chips, tiles and list rows: instant scale (about 0.97) and highlight on `:active`/pointerdown, committed on release; cancel when dragged away. Minimum 44px touch targets. Visible focus rings (never removed).
- Remove any artificial delays on the input path (debounces that block feedback, transition waits, tap delay).
- No locked UI during transitions: every open/close can be grabbed and reversed.

### 3. Notebook list and workspace shell
- Notebook cards: press feedback, hover lift using transform/opacity only, rename/delete with **undo toast** instead of confirm dialog (soft delete with a short grace window, backend purge afterwards), the dialogs reserved for truly irreversible actions.
- Three-panel workspace: panel collapse/expand as springs, resize handles with rubber-banding at min/max, snap points chosen by **momentum projection** from release velocity; panel state remembered.
- **Mobile layout:** tabs become a bottom navigation plus a **bottom sheet** (Sources / Studio) with direct drag, velocity handoff, projection to snap points (peek / half / full), rubber-band at edges, background dim only for modal tasks.

### 4. Chat panel
- Header and composer as **translucent floating layers**; messages scroll underneath; replace hairline dividers with **scroll-edge fade masks** (`mask-image`) only where chrome overlaps content.
- Streaming text without layout shift (reserve space, no reflow jumps), smooth auto-scroll that yields to the user as soon as they scroll up ("jump to latest" control).
- Message enter: small opacity + translate spring. Citation chips: press feedback, hover card scales from the chip (transform-origin = trigger).
- Stop button appears instantly; composer grows with a spring; suggested follow-ups as a horizontally scrollable strip with edge fades.
- Empty state teaches the next action (specific labels such as "Add a source", not generic "Get started").

### 5. Source viewer (citation jump)
- **Spatial consistency:** drawer enters from the right and exits to the right; opening from a citation anchors the origin to that chip. Non-blocking (parallel) panel uses translucency and offset with **no scrim**; modal flows (delete, share settings) use scrim + push-back.
- Highlight arrival: gentle scroll spring to the passage and a short fade-in of the highlight (not a flashing animation); reduced-motion version is an instant jump with a static highlight.
- Next/previous citation navigation is interruptible mid-scroll.

### 6. Studio and artifacts
- Tiles: press feedback, generating state **materializes** (blur + scale together, then settles) instead of a plain fade; progress shows stage names and an estimate when known.
- **Flashcards:** card flip as an interruptible spring, swipe-to-mark (known/unknown) with 1:1 tracking, velocity decides commit or return (use velocity sign, not position), rubber-band at the stack edge.
- **Quiz:** answer feedback status/completion/error, smooth question transitions, tabular numerals for score.
- **Mind map:** keep React Flow; add spring zoom-to-node and momentum pan; node details panel follows the same drawer rules.
- **Audio player:** scrubber with direct manipulation (pointer capture, grab offset respected), speed picker, transcript line highlight that scrolls with a spring and yields when the user scrolls.

### 7. Settings, auth, dialogs, toasts
- Auth pages: calm, typographically strong, inline validation (not on submit), specific error messages.
- Settings: model picker as a searchable list with keyboard navigation; connection test shows the four feedback kinds (status, completion, warning, error).
- Toasts stack with springs, are swipe-dismissible, and offer Undo where an action is reversible.
- Command palette (Cmd/Ctrl+K) for notebook/source/artifact navigation with spring open/close from the center-top anchor.

### 8. Materials and depth rules
- Heavier/darker material for structural regions (sidebar), lighter for interactive floating elements; never stack a light translucent layer on another; larger surfaces use stronger blur and deeper shadow.
- Text on translucent surfaces gets higher contrast and slightly heavier weight; colors sit on a solid layer.
- A single `Material` component encapsulates blur, saturation, tint, top-edge highlight, and the fallbacks (reduced transparency -> opaque; more contrast -> near-solid with a visible border).

### 9. Design lab (dev-only route `/design-lab`)
Interactive prototypes to feel the motion before shipping: spring playground (damping/response sliders), draggable sheet with projection, flip card, scrubber. Guarded so it is not in production builds.

## Agent Prompt
```


Read AGENTS.md, AGENTS_ADDENDUM.md and docs/levels/LEVEL_14_apple_design_ui.md. Execute LEVEL 14 only.
First read the installed apple-design skill (and improve-animations, better-ui, frontend-design if present) and ask the apple-design skill this concrete question: "Given the screens listed in LEVEL_14 scope, what spring parameters, material tokens, and interruption rules should we adopt for a Next.js app using Motion?" Record the answer as ADR-015.
Then work in passes with commits and Playwright screenshots (1440 px and 390 px, light and dark) before/after each pass:
PASS 1 tokens (type, color, material, springs, motion/transparency/contrast prefs) + Material component + useMotionPrefs.
PASS 2 global interaction layer (press feedback, focus rings, 44 px targets) across all primitives.
PASS 3 workspace shell, resizable panels with rubber-band + momentum snap, mobile bottom sheet, undo-toast deletes (add soft delete + delayed purge in the API with tests).
PASS 4 chat panel and composer, scroll-edge fades, streaming without layout shift.
PASS 5 source viewer drawer and citation transitions.
PASS 6 Studio tiles, flashcards, quiz, mind map polish, audio scrubber.
PASS 7 auth/settings/toasts/command palette; design-lab route.
PASS 8 accessibility, performance and visual regression hardening.
Constraints: animate only transform and opacity (plus blur on materialize), never lock input during transitions, no animation on first paint of static content, no autoplaying loops, every effect honors reduced motion/transparency/contrast, keep bundle growth under 60 KB gzipped for the motion layer (measure), keep all existing e2e journeys green. Prefer restraint: if an effect does not serve feedback, hierarchy or continuity, do not add it.
Write .agents/LEVEL_14_REPORT.md with before/after screenshots, measured numbers and any rules you deliberately broke (with reasons).
Output <promise>L14_COMPLETE</promise> only when acceptance tests pass.



```

## Task checklist
- [ ] 14.1 Install skills, read them, ADR-015 with the skill's answer
- [ ] 14.2 Tokens: typography, color, material, springs, motion prefs hook
- [ ] 14.3 Material component with all fallbacks
- [ ] 14.4 Global press feedback, focus rings, touch targets
- [ ] 14.5 Workspace shell, panel springs, rubber-band, momentum snap
- [ ] 14.6 Mobile bottom sheet with velocity handoff
- [ ] 14.7 Soft delete + undo toasts (API + UI)
- [ ] 14.8 Chat panel, composer, edge fades, streaming stability
- [ ] 14.9 Source viewer drawer + citation anchored transitions
- [ ] 14.10 Studio tiles, flashcard gestures, quiz, mind map, audio scrubber
- [ ] 14.11 Auth, settings, toasts, command palette
- [ ] 14.12 /design-lab (dev only)
- [ ] 14.13 A11y, performance, visual regression, report

## Acceptance tests (all automated where possible)
1. **Response:** pointerdown to visible pressed state in under 1 frame (measure with `performance.now()` and `requestAnimationFrame` in Playwright) for buttons, chips, tiles.
2. **Interruptibility:** start closing the source drawer, interrupt at about 50%, reverse; sampled transform values show no discontinuity larger than 2 px between consecutive frames and the drawer ends open. Same test for bottom sheet and flashcard flip.
3. **Reduced motion:** with `reducedMotion: "reduce"` emulation, no element has a running transform animation (`getAnimations()` assertion); state changes use short opacity cross-fades; no overshoot.
4. **Reduced transparency / more contrast:** materials render opaque / near-solid with visible borders (computed-style assertions).
5. **Spatial consistency:** enter and exit transforms share the same axis and sign-mirror for drawers, sheets and toasts (unit test on the animation config).
6. **Typography:** large headings have negative tracking, body near zero, small text slightly positive (token test); layout survives browser font size 200% without overflow.
7. **Performance:** no jank during drag (long-frame budget in a Playwright trace), CLS < 0.1, INP < 200 ms on the main journeys, motion layer bundle growth under 60 KB gzipped, only transform/opacity animated (lint rule or test).
8. **Accessibility:** axe zero critical violations on all main screens (signed in), keyboard-only completion of the main journey, visible focus rings, 44 px targets.
9. **No regressions:** all earlier Playwright journeys and Python tests green; visual regression snapshots updated deliberately at 1440 px and 390 px, light and dark.
10. **Undo:** deleting a notebook/source shows an Undo toast; undo restores everything; without undo the purge happens after the grace period (API test + e2e).

## Working condition
"I can drag, flick and interrupt things, nothing waits for an animation to finish, it still works with reduced motion, and it feels calm and deliberate rather than flashy."