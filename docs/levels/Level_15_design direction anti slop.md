# LEVEL 15: Design Direction and Anti-Slop Redesign (run BEFORE Level 14)

Prerequisite: Level 11 task 11.2 (e2e in CI) is green. Level 14 reuses this level's tokens, so finish this first. Motion on top of a generic look only gives you a moving generic look.

## Why the UI feels like "AI slop"
Slop is not a missing effect. It is the absence of decisions. Agents fall back to the statistical average: default shadcn grays, Inter, identical rounded cards with border + shadow, one purple/blue accent or gradient, an icon on every row, centered empty states with a sparkle, "glass" everywhere, equal spacing everywhere, generic copy. Fixing it needs (1) a chosen direction and references, (2) a written design system the agent must obey, (3) design made from visual comps and screenshot feedback, not from code alone, (4) deterministic checks that catch the tells.

Honest limits: skills are prompts, and their effect varies with the model. Without a direction and a visual feedback loop they only move the average a little.

## Objectives and goals
- One clear visual identity for a research tool: calm, dense where it should be, typographically strong.
- A DESIGN.md that agents and humans follow, enforced by automated checks.
- Product-specific design moves that no template would produce.

## Step 0: you decide (30 minutes, not the agent)
1. Collect 5-8 reference screenshots you genuinely like (for example NotebookLM, Linear, Things, Readwise Reader, Craft, Arc, Are.na, Apple Notes). Save to `docs/design/references/`. Write one line per image on what you like (type, density, spacing, color restraint).
2. Pick ONE direction below (or write your own):
   - **A. Reading Room:** warm paper neutrals, serif for reading text and headings, clean sans for UI, one ink accent (deep blue or terracotta), hairline borders, almost no shadows, editorial hierarchy.
   - **B. Quiet Instrument:** Apple-like. System font, cool neutrals, one accent, materials and springs (pairs with Level 14).
   - **C. Lab Notebook:** near-monochrome, monospace for metadata and numbers, visible grid and rules, footnote-style citations, high density, technical charm.
3. Pick two fonts max (OFL/free). Avoid Inter as the display face. Candidates to evaluate: Newsreader or Source Serif 4 (serif), Geist or Instrument Sans (UI sans), Geist Mono or JetBrains Mono (mono). Verify licenses and Next.js `next/font` support.

## Scope
1. **Audit first.** Screenshot every screen (1440 and 390 px, light and dark). Produce `docs/design/AUDIT.md`: a table of slop tells found, severity, screen, fix. Use the checklist below.
2. **DESIGN.md** (fill from `DESIGN_TEMPLATE` below): principles, type scale, spacing scale, color tokens (neutrals + 1 accent + 3 semantic), radii (max 3), shadows (max 3), borders, density rules, icon style (one set, outline, used sparingly), component rules, motion rules (defer to Level 14), copy rules.
3. **Tokenize and enforce.** Replace raw values with tokens everywhere; add `scripts/design-audit.mjs` (see acceptance tests) and run it in CI.
4. **Product-specific moves** (what makes it not generic):
   - Citations as footnote-style superscript numerals inline, with a margin preview card; no pill chips with colors.
   - Sources list as a quiet document list (file-type glyph, title, status as text, not colored badges).
   - Studio items as a typographic list with real previews (first lines of the output), not gradient tiles with icons.
   - Empty states show a real example (a sample question and answer) instead of illustrations or sparkles.
   - Reading surfaces (viewer, artifacts, notes) use comfortable measure (60-75 characters), real leading, and the reading typeface.
   - Status uses words and small marks; color is reserved for meaning (error, success, active).
   - Copy: specific verbs and nouns ("Add a PDF, link or note"), no exclamation marks, no "Unlock", "Seamlessly", "Supercharge".
5. **Comps before code.** For the three hardest screens (workspace, source viewer + citations, Studio/artifact), produce visual comps first (Claude Design if you have access, Google Stitch, v0, Figma, or hand sketches), get your approval, then implement to match the comp closely.
6. **Screenshot critique loop.** After each pass the agent screenshots, compares against the references and the comp, lists the 5 biggest remaining tells, fixes them, repeats up to 4 rounds per screen.

## Slop checklist (the audit uses this)
Default purple/blue gradients or gradient text; glow edges; decorative blobs; glass on everything; identical cards (same radius, border and shadow everywhere); an icon in front of every list row; colored badges everywhere; emoji as icons; centered hero-style empty states; every section the same padding; three-column "feature cards" layouts; Inter + gray-500 everywhere; low-contrast placeholder text; shadows on flat lists; animated everything; generic or marketing copy inside a tool; inconsistent radii/spacing; no clear hierarchy (everything medium weight).

## Skills to install (review each SKILL.md first; activate per pass, not all at once)
| Role | Skill | Install |
|---|---|---|
| Baseline | frontend-design (anthropics) | `npx skills add anthropics/skills -s frontend-design` |
| Audit-first redesign | redesign-skill from taste-skill (Leonxlnx) | `npx skills add https://github.com/Leonxlnx/taste-skill` (then use its redesign-skill; its main skill targets marketing pages, so do not apply it blindly to a dashboard) |
| Soft depth and spring feel (optional) | soft-skill (same repo) | same command |
| Motion and polish details | emil-design-eng, apple-design (Emil Kowalski) | `npx skills add emilkowalski/skills` |
| Deterministic checks | "Impeccable" anti-slop rules (reported as 59 deterministic rules usable in CI) | search for the repo, read it, pin a version |
| Broader recipes (optional) | ui-ux-pro-max, web-design-engineer, ui-design-brain | `npx skills add nextlevelbuilder/ui-ux-pro-max-skill`, `npx skills add ConardLi/garden-skills -s web-design-engineer`, github.com/carmahhawwari/ui-design-brain |
Rule: at most 3 skills active in one pass (baseline + one direction + motion). Conflicting skills produce mush.

## Agent Prompt
```
Read AGENTS.md, AGENTS_ADDENDUM.md, docs/levels/LEVEL_15_design_direction_anti_slop.md, docs/design/references/ and the chosen direction in docs/design/DIRECTION.md (the user writes this file).
Execute LEVEL 15 only.
PASS 1 Audit: screenshot all screens (1440/390, light/dark) and write docs/design/AUDIT.md using the slop checklist. Do not change code yet.
PASS 2 Write docs/design/DESIGN.md from DESIGN_TEMPLATE, then tokens (CSS variables + Tailwind theme), fonts via next/font, and scripts/design-audit.mjs wired into CI.
PASS 3 Stop and ask the user to approve comps for workspace, source viewer + citations, Studio/artifact. Implement only after approval.
PASS 4 Implement screen by screen with the screenshot critique loop (max 4 rounds per screen), invoking frontend-design plus ONE direction skill. Always give a skill a concrete question or task.
PASS 5 Microcopy rewrite, empty states with real examples, citation footnotes, sources list, studio list.
PASS 6 Final audit: rerun design-audit, axe, e2e, screenshots; write .agents/LEVEL_15_REPORT.md with before/after and the remaining known tells.
Output <promise>L15_COMPLETE</promise> only when acceptance tests pass and the user has approved the screenshots.
```

## Task checklist
- [ ] 15.0 User: references, direction, fonts (docs/design/DIRECTION.md)
- [ ] 15.1 Audit with screenshots + AUDIT.md
- [ ] 15.2 DESIGN.md + tokens + fonts
- [ ] 15.3 design-audit script in CI
- [ ] 15.4 Comps approved by user
- [ ] 15.5 Workspace shell redesign
- [ ] 15.6 Chat + footnote citations + margin preview
- [ ] 15.7 Source list + viewer reading surface
- [ ] 15.8 Studio list + artifact reading surfaces
- [ ] 15.9 Auth, settings, empty states, microcopy
- [ ] 15.10 Mobile pass (390 px)
- [ ] 15.11 Final audit + report

## Acceptance tests
1. `scripts/design-audit.mjs` passes in CI: no raw hex/rgb outside token files; at most 2 font families (+1 mono); at most 3 radii; at most 3 shadows; exactly 1 accent hue plus semantic colors; type sizes only from the scale; spacing only from the scale.
2. Banned-pattern scan passes: no gradient text, no `from-purple`/`to-blue` style default gradients, no emoji used as icons, no `backdrop-blur` outside the Material component, no colored badge variants beyond the semantic set.
3. Contrast: all text meets WCAG AA in light and dark; axe zero critical violations.
4. Reading measure: artifact and viewer text lines are 60-75 characters at desktop width (automated check on computed width/font size).
5. Citations render as footnote-style markers with a margin preview; keyboard accessible.
6. Blind review: the user compares 5 screens against the references and rates each at least 4/5 on "would I believe a designer made this". Anything below is reworked.
7. e2e journeys and all earlier tests stay green; Lighthouse performance and accessibility not worse than before.

## Working condition
"I can show a screenshot to someone and they ask which designer or product it resembles, not which AI made it."