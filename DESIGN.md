# DESIGN.md — Notebook (NotebookLM-style research workspace)

> Single source of truth for all UI. Every screen, component and future feature MUST follow this file.
> If something is not covered here, extend this file first (see §15), then build.
> Direction: **warm editorial** — paper-like surfaces, serif headings, calm reading-first layout, one terracotta accent.
> Influences: Notion (warm minimalism, soft surfaces), Claude (editorial reading, terracotta accent), Linear (precision, density, restraint), Mintlify (long-form readability).

---

## 0. Design principles (read before every UI task)

1. **Content is the interface.** Sources, notes and answers are the hero. Chrome (nav, toolbars, borders) stays quiet.
2. **One accent, used sparingly.** Terracotta marks the single most important action or the current selection — never decoration.
3. **Hierarchy through type and space, not boxes.** Prefer whitespace and font weight over borders, shadows and background fills.
4. **Warm, not beige.** Neutrals are slightly warm. Never pure `#FFFFFF` canvas or pure `#000000` text.
5. **Quiet motion.** Motion confirms an action; it never performs.
6. **Calm density.** Tool-like information density (Linear) with reading comfort (Notion). Nothing cramped, nothing floaty.
7. **Every pixel is a token.** No hard-coded hex, px, radius or shadow in components. Only tokens from this file.

## 1. Anti-slop rules (hard bans)

The current UI feels AI-generated. These patterns are **banned**:

- ❌ Purple/blue/pink gradients, mesh gradients, glowing blobs, aurora backgrounds
- ❌ Glassmorphism / `backdrop-blur` panels (only allowed on the command palette overlay scrim)
- ❌ Gradient text, rainbow borders, animated shimmer on static content
- ❌ Emoji as icons (✨🚀📄💡). Sparkle icons for "AI" anywhere
- ❌ `rounded-2xl`/`rounded-3xl` on everything; pill-shaped everything
- ❌ Heavy drop shadows on cards; shadows stacked with borders on the same element
- ❌ Centered hero text + three feature cards inside the app
- ❌ Every section in its own bordered card ("card soup")
- ❌ Multiple accent colors competing; colored icons in navigation
- ❌ Generic copy: "Unlock the power of…", "Your AI-powered…", "Let's get started! 🎉"
- ❌ Placeholder lorem, fake stats, decorative illustrations without purpose
- ❌ Bouncy/spring animations, scale-up on hover for cards, pulsing buttons
- ❌ Font weights above 600 in UI; all-caps body text; more than 2 typefaces + mono
- ❌ Inconsistent icon sizes or mixing icon libraries
- ❌ Hard-coded colors (`bg-gray-100`, `text-[#333]`) — tokens only

## 2. Color tokens

All colors are CSS variables in `app/globals.css`, exposed to Tailwind (see §13). Names are **semantic** (role), never visual (`--beige`).

### 2.1 Light theme (`:root`)

| Token | Hex | Role |
|---|---|---|
| `--bg-canvas` | `#F7F5F0` | App background (paper) |
| `--bg-surface` | `#FDFCF9` | Panels, cards, chat area |
| `--bg-raised` | `#FFFFFF` | Popovers, menus, dialogs, inputs |
| `--bg-sunken` | `#F0EDE6` | Wells, code blocks, selected list row base |
| `--bg-hover` | `#EEEAE2` | Hover fill for rows, ghost buttons |
| `--bg-active` | `#E7E2D8` | Pressed / active fill |
| `--border-subtle` | `#ECE8E0` | Dividers inside panels |
| `--border-default` | `#E2DDD2` | Panel edges, inputs, cards |
| `--border-strong` | `#CFC8BA` | Hover border on inputs, focused outlines (non-accent) |
| `--text-primary` | `#1F1D1A` | Headings, body |
| `--text-secondary` | `#5C574F` | Labels, metadata, secondary body |
| `--text-tertiary` | `#8A8478` | Placeholders, timestamps, disabled-ish hints |
| `--text-disabled` | `#B4AEA3` | Disabled text |
| `--text-on-accent` | `#FFFFFF` | Text on accent fills |
| `--accent` | `#C2573A` | Primary action, current selection, links |
| `--accent-hover` | `#A9492F` | Hover on accent |
| `--accent-active` | `#923F28` | Pressed on accent |
| `--accent-soft` | `#F6E6DE` | Accent tint backgrounds (selected chip, citation hover) |
| `--accent-soft-text` | `#8F3E27` | Text on `--accent-soft` |
| `--focus-ring` | `#C2573A66` | 2px focus ring (40% accent) |

### 2.2 Dark theme (`[data-theme="dark"]` and `prefers-color-scheme: dark` unless user forced light)

| Token | Hex |
|---|---|
| `--bg-canvas` | `#161513` |
| `--bg-surface` | `#1C1B18` |
| `--bg-raised` | `#24221F` |
| `--bg-sunken` | `#121110` |
| `--bg-hover` | `#2A2824` |
| `--bg-active` | `#322F2A` |
| `--border-subtle` | `#262420` |
| `--border-default` | `#302D28` |
| `--border-strong` | `#423E37` |
| `--text-primary` | `#ECE8E1` |
| `--text-secondary` | `#ABA59B` |
| `--text-tertiary` | `#7B766D` |
| `--text-disabled` | `#57534C` |
| `--text-on-accent` | `#1A0F0B` |
| `--accent` | `#E08463` |
| `--accent-hover` | `#EA9676` |
| `--accent-active` | `#D07254` |
| `--accent-soft` | `#3A2419` |
| `--accent-soft-text` | `#F0B49C` |
| `--focus-ring` | `#E0846380` |

Dark-mode rules: no pure black; elevation = lighter surface, **not** shadow; reduce image brightness to 90%.

### 2.3 Semantic / status

| Token | Light | Dark | Use |
|---|---|---|---|
| `--success` / `--success-soft` | `#3F7A55` / `#E3EFE6` | `#7FBF94` / `#1E2E23` | Source indexed, saved |
| `--warning` / `--warning-soft` | `#A86B14` / `#F6EBD6` | `#E0A94F` / `#33281A` | Partial index, quota |
| `--danger` / `--danger-soft` | `#B23A3A` / `#F6E1DF` | `#E57B7B` / `#3A1E1E` | Failed upload, delete |
| `--info` / `--info-soft` | `#3A6A9E` / `#E2EAF4` | `#86AEDB` / `#1C2633` | Tips, neutral notices |

Status color = small dot or icon + text. Never fill a whole panel with status color.

### 2.4 Source-type colors (muted, for 16px type badges only)

| Type | Token | Light | Dark |
|---|---|---|---|
| PDF | `--src-pdf` | `#B4513B` | `#E08A73` |
| Web / URL | `--src-web` | `#3A6A9E` | `#86AEDB` |
| YouTube / video | `--src-video` | `#A33B3B` | `#E07A7A` |
| Audio | `--src-audio` | `#6B5BA3` | `#A898DB` |
| Google Doc / Doc | `--src-doc` | `#3F7A55` | `#7FBF94` |
| Pasted text | `--src-text` | `#6E675C` | `#ABA59B` |

Used only as icon color inside a 24px `--bg-sunken` square. Never as backgrounds or borders.

### 2.5 Usage ratio
~85% neutrals, ~10% text contrast, ≤5% accent. If a screen has more than ~3 accent-colored elements visible, remove some.

## 3. Typography

### 3.1 Families (via `next/font`)
- **Display / headings:** `Source Serif 4` (variable, opsz) → `--font-serif`
- **UI / body:** `Geist Sans` → `--font-sans`
- **Mono:** `Geist Mono` → `--font-mono` (citations IDs, code, keyboard shortcuts, token counts)

Serif is for **editorial moments only**: page titles, notebook titles, note titles, generated report headings, empty-state headlines. All controls, labels, nav and chat UI use sans.

### 3.2 Scale

| Token | Family | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `display` | serif | 36 / 44 | 500 | -0.02em | Home "Your notebooks" heading |
| `title-1` | serif | 28 / 36 | 500 | -0.015em | Notebook title in header |
| `title-2` | serif | 22 / 30 | 500 | -0.01em | Note title, report H1, dialog title |
| `title-3` | serif | 18 / 26 | 600 | -0.005em | Report H2, section titles in long content |
| `heading` | sans | 15 / 22 | 600 | -0.005em | Panel titles ("Sources", "Chat", "Studio") |
| `body-lg` | sans | 16 / 26 | 400 | 0 | Chat answers, note body, reading view |
| `body` | sans | 14 / 22 | 400 | 0 | Default UI text |
| `body-strong` | sans | 14 / 22 | 500 | 0 | List item titles, button text |
| `small` | sans | 13 / 20 | 400 | 0 | Metadata, helper text |
| `caption` | sans | 12 / 16 | 500 | 0.01em | Badges, counts, timestamps |
| `overline` | sans | 11 / 16 | 600 | 0.06em, UPPERCASE | Rare group labels in menus only |
| `mono` | mono | 13 / 20 | 400 | 0 | Code, shortcuts, IDs |

Rules: max line length 68ch for reading content; paragraphs spaced 12px; never use weight 700+; numbers in tables use `tabular-nums`.

## 4. Spacing, layout and grid

**Base unit 4px.** Allowed spacing tokens: `0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80`. Nothing else.

| Context | Value |
|---|---|
| Inside buttons/inputs (x) | 12 (sm 10, lg 16) |
| List row padding | 8 y / 12 x |
| Panel inner padding | 16 (dense) / 20 (default) |
| Gap between related items | 8 |
| Gap between groups | 16–24 |
| Gap between page sections | 32–48 |

### 4.1 App shell (notebook view) — three panes
```
┌──────────────────────────────────────────────────────────────────────┐
│ Top bar 52px: [logo] Notebook title (serif)       [Share][⚙][Avatar] │
├───────────────┬────────────────────────────────────┬─────────────────┤
│ SOURCES       │ CHAT                               │ STUDIO          │
│ 300px         │ flex (min 480, reading col ≤720)   │ 340px           │
│ collapsible   │                                    │ collapsible     │
│ to 56px rail  │                                    │ to 56px rail    │
└───────────────┴────────────────────────────────────┴─────────────────┘
```
- Canvas `--bg-canvas`; panes `--bg-surface`, separated by **8px gaps** of canvas, radius `--radius-lg`, 1px `--border-subtle`. (Alternative if it feels heavy: no gaps, single 1px dividers — pick one globally, don't mix.)
- Each pane: 48px header (`heading` + icon actions right), scrollable body, optional sticky footer.
- Pane resize handles: 4px hit area, show `--border-strong` line on hover.
- Collapsed rail shows only icons with tooltips.

### 4.2 Breakpoints
| Name | Width | Behavior |
|---|---|---|
| `sm` | <768 | Single pane + bottom tab bar (Sources / Chat / Studio) |
| `md` | 768–1199 | Chat + one side pane; other opens as sheet |
| `lg` | 1200–1599 | All three panes |
| `xl` | ≥1600 | All three, wider reading column, panes max 360 |

### 4.3 Home (notebook list)
Max width 1200, centered, 48px top padding. `display` heading left-aligned + "New notebook" primary button right. Toggle grid/list. Grid: 4/3/2/1 columns, card 200px tall.

## 5. Radius, borders, elevation

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | 4px | Badges, checkboxes, kbd |
| `--radius-sm` | 6px | Buttons, inputs, chips, list rows |
| `--radius-md` | 8px | Cards, menus, popovers |
| `--radius-lg` | 12px | Panes, dialogs, composer |
| `--radius-full` | 9999px | Avatars, status dots, toggle switch only |

Borders: always 1px. `--border-subtle` inside, `--border-default` on edges.

| Shadow | Value (light) | Use |
|---|---|---|
| `--shadow-none` | none | Default — most things |
| `--shadow-sm` | `0 1px 2px rgba(31,29,26,.06)` | Composer, raised input |
| `--shadow-md` | `0 4px 12px rgba(31,29,26,.08), 0 1px 3px rgba(31,29,26,.06)` | Menus, popovers, tooltips |
| `--shadow-lg` | `0 16px 40px rgba(31,29,26,.12), 0 2px 6px rgba(31,29,26,.06)` | Dialogs, command palette |

Dark mode: shadows use `rgba(0,0,0,.4)` and are paired with a 1px `--border-default`. Cards never have shadows at rest.

## 6. Iconography

- **Library:** `lucide-react` only. No other icon sets, no emoji, no custom SVG unless added to `components/icons/` and documented here.
- **Stroke:** 1.5 (set globally via a wrapper `<Icon>` component).
- **Sizes:** 14 (inline in small text), **16 (default UI)**, 18 (pane headers, top bar), 20 (empty states inline). 32–40 only for empty-state illustrations, stroke 1.25, `--text-tertiary`.
- **Color:** inherits `currentColor`. Default `--text-secondary`; `--text-primary` on hover/active; `--accent` only for the active state of a primary nav/tool.
- **Icon buttons:** 32×32 (sm 28, lg 36), icon centered, `--radius-sm`, ghost style. Always have `aria-label` + tooltip.
- **Icon + label gap:** 8px (6px in sm buttons).

### 6.1 Icon map (use these, don't improvise)
| Concept | Lucide icon |
|---|---|
| Add source | `Plus` |
| Upload | `Upload` |
| PDF | `FileText` |
| Web link | `Globe` |
| YouTube / video | `PlaySquare` (neutral; avoid brand logo icons) |
| Audio | `AudioLines` |
| Pasted text | `ClipboardType` |
| Doc | `FileType2` |
| Notebook | `BookOpen` |
| Note | `StickyNote` |
| Save to note | `BookmarkPlus` |
| Audio overview | `Headphones` |
| Mind map | `Network` |
| Study guide / report | `ScrollText` |
| FAQ | `MessagesSquare` |
| Timeline | `GanttChart` |
| Briefing doc | `Newspaper` |
| Send message | `ArrowUp` |
| Stop generating | `Square` |
| Copy | `Copy` |
| Regenerate | `RotateCcw` |
| Citation | numbered inline chip (no icon) |
| Search | `Search` |
| Settings | `Settings` |
| Share | `Share2` |
| More | `MoreHorizontal` |
| Collapse pane | `PanelLeftClose` / `PanelRightClose` |
| Expand pane | `PanelLeftOpen` / `PanelRightOpen` |
| Delete | `Trash2` |
| Rename | `Pencil` |
| Theme | `Sun` / `Moon` |
| Success / Error / Warning / Info | `CheckCircle2` / `XCircle` / `AlertTriangle` / `Info` |

## 7. Motion

| Token | Value | Use |
|---|---|---|
| `--dur-fast` | 120ms | Hover, color, focus |
| `--dur-base` | 180ms | Menus, tooltips, chips |
| `--dur-slow` | 260ms | Dialogs, pane collapse, sheets |
| `--ease-out` | `cubic-bezier(.2,.8,.2,1)` | Enter |
| `--ease-in` | `cubic-bezier(.4,0,1,1)` | Exit |

Allowed: opacity, 4–8px translate, height for collapse, color. Banned: scale > 1.02, bounce, spin (except loading spinner), parallax. Respect `prefers-reduced-motion` → durations 0, keep opacity only.

Streaming text: append tokens without per-word fade; show a 2px-wide blinking caret in `--text-tertiary` at the end.

## 8. Components

Every component lives in `components/ui/`. Variants via `cva`. States required for all interactive components: **default, hover, active, focus-visible, disabled, loading** (where applicable).

### 8.1 Button
| Variant | Default | Hover | Notes |
|---|---|---|---|
| `primary` | bg `--accent`, text `--text-on-accent` | `--accent-hover` | Max **one per view region** |
| `secondary` | bg `--bg-raised`, 1px `--border-default`, text `--text-primary` | bg `--bg-hover`, border `--border-strong` | Most actions |
| `ghost` | transparent, text `--text-secondary` | bg `--bg-hover`, text `--text-primary` | Toolbars, pane headers |
| `danger` | bg `--danger`, white text | darker 8% | Only in confirm dialogs |
| `link` | text `--accent`, underline on hover (1px, offset 3px) | — | Inline |

Sizes: `sm` h28 px10 `small`; `md` h32 px12 `body-strong`; `lg` h40 px16 `body-strong`. Radius `--radius-sm`. Focus: `0 0 0 2px var(--bg-surface), 0 0 0 4px var(--focus-ring)`. Loading: replace leading icon with 14px spinner, keep width.

### 8.2 Inputs (text, textarea, search, select)
h32 (lg h40), bg `--bg-raised`, 1px `--border-default`, radius `--radius-sm`, text `body`, placeholder `--text-tertiary`. Hover border `--border-strong`. Focus border `--accent` + focus ring. Error: border `--danger`, helper text `small` `--danger` below with `XCircle` 14. Labels above, `small` 500 `--text-secondary`, 6px gap.

### 8.3 Chat composer
- Sticky at bottom of Chat pane, max-width = reading column (720), 16px from bottom.
- Container: bg `--bg-raised`, 1px `--border-default`, `--radius-lg`, `--shadow-sm`, padding 12.
- Auto-grow textarea 1→8 lines, `body-lg`, placeholder: "Ask about your sources…".
- Footer row inside: left = source scope chip ("12 sources" with `ChevronDown`); right = send icon button (32, `--accent` fill when text present, `--bg-sunken` + `--text-disabled` when empty). Switches to `Square` stop while streaming.
- Below composer: `caption` `--text-tertiary` disclaimer, centered, one line.

### 8.4 Chat messages
- **User message:** right-aligned bubble, max-width 80%, bg `--bg-sunken`, `--radius-lg` (bottom-right `--radius-sm`), padding 10/14, `body-lg`.
- **Assistant message:** **no bubble**. Full reading-column width, `body-lg`, rendered markdown (see §8.11). 24px between turns.
- Assistant action row below (appears on hover, always visible on last message): ghost icon buttons 28 — `Copy`, `BookmarkPlus` (Save to note), `RotateCcw`, `ThumbsUp`, `ThumbsDown`. Gap 2.
- Suggested follow-ups: up to 3 secondary chips (`sm`, `--radius-sm`), stacked or wrapped, below the last answer.

### 8.5 Citation chip (core NotebookLM feature)
- Inline after the cited sentence: `caption` mono numeral, min-width 18, h18, padding 0 5, bg `--bg-sunken`, text `--text-secondary`, `--radius-xs`, 1px `--border-subtle`, baseline-shifted -1px.
- Hover: bg `--accent-soft`, text `--accent-soft-text`. Shows **citation popover** (`--bg-raised`, `--shadow-md`, `--radius-md`, max-w 360): source type badge + source title (`body-strong`, 1 line truncate) + quoted passage (`small`, 4 lines clamp, left 2px `--accent` rule, padding-left 10).
- Click: opens the source in Sources pane reading view and highlights the passage with `--accent-soft` background.

### 8.6 Source list item (Sources pane)
Row h44, padding 8/12, `--radius-sm`, gap 10.
`[checkbox 16] [type badge 24] [title body-strong 1-line truncate + meta caption --text-tertiary] [more icon on hover]`
- Hover: `--bg-hover`. Selected (open): `--bg-active` + title `--text-primary`.
- Processing: replace meta with "Indexing…" + 12px spinner; failed: `AlertTriangle` 14 `--danger` + "Failed — Retry" link.
- Pane header: "Sources" + count `caption` + `Plus` ghost button. Below header: "Select all" checkbox row and search input (sm).

### 8.7 Add-source dialog
Dialog w560, `--radius-lg`, `--shadow-lg`, padding 24. Title `title-2` serif "Add sources". Large dropzone (h160, 1px **dashed** `--border-strong`, `--radius-md`, bg `--bg-sunken`, centered `Upload` 20 + `body` + `small` supported types). Below: 3 option rows (Link, YouTube, Paste text) as secondary list buttons with icons. Source limit progress bar at bottom (4px, `--bg-sunken` track, `--text-secondary` fill; `--warning` above 80%).

### 8.8 Studio pane tool tiles
2-column grid, gap 8. Tile: h72, bg `--bg-surface`, 1px `--border-default`, `--radius-md`, padding 12, icon 18 `--text-secondary` top-left, label `body-strong`, sub `caption` `--text-tertiary`. Hover: `--bg-hover`, border `--border-strong`. **No colored tile backgrounds.**
Generated outputs list below tiles: rows like §8.6 with output icon, title, "Generated 2m ago". Generating: inline progress row with spinner + "Generating audio overview…" + Cancel ghost.

### 8.9 Audio overview player
Card `--bg-surface`, `--radius-md`, 1px border, padding 16. Title `body-strong`, meta `caption`. Controls row: play/pause 36 circle (`--accent` fill — the one accent in Studio), scrubber (4px track `--bg-sunken`, progress `--text-primary`, thumb 12 on hover), time `mono caption`, speed menu, `MoreHorizontal`. Optional waveform in `--border-strong` bars — static, no animated glow.

### 8.10 Notes
- Note card (in Studio list): `body-strong` sans title + 2-line `small` preview + `caption` date. (Serif is reserved for the open editor title.)
- Note editor (opens over Studio or as a center reading view): title `title-2` serif, body `body-lg`, toolbar ghost icons 28. Saved-from-chat notes show a `caption` "From chat · 3 citations".

### 8.11 Rendered markdown (answers, notes, reports)
- H1 `title-2` serif, H2 `title-3` serif, H3 `heading` sans. Top margin 24/20/16, bottom 8.
- Paragraph `body-lg`, 12 gap. Lists: 20 indent, 6 between items, markers `--text-tertiary`.
- Blockquote: 2px left `--border-strong`, padding-left 14, `--text-secondary`.
- Inline code: mono 13, bg `--bg-sunken`, padding 1/5, `--radius-xs`. Code blocks: bg `--bg-sunken`, 1px `--border-subtle`, `--radius-md`, padding 14, copy button top-right ghost.
- Tables: full width, header `small` 600 `--text-secondary`, row 1px `--border-subtle` dividers, no zebra, no outer border.
- Links `--accent`, underline on hover.

### 8.12 Top bar
h52, bg `--bg-canvas` (blends), no bottom border (panes create separation). Left: 24px logo mark (monochrome) + notebook title in **serif 18/24 500** (`title-1` is too large for the bar), click to rename inline. Right: `Share` secondary sm, settings ghost icon, theme toggle, avatar 28.

### 8.13 Menus, popovers, tooltips
- Menu: `--bg-raised`, 1px `--border-default`, `--radius-md`, `--shadow-md`, padding 4, min-w 180. Item h32, padding 0/10, `--radius-sm`, icon 16 + label `body`, shortcut `mono caption --text-tertiary` right. Hover `--bg-hover`. Destructive item text `--danger`. Separators 1px `--border-subtle`, 4 margin.
- Tooltip: bg `--text-primary`, text `--bg-surface`, `caption`, padding 4/8, `--radius-xs`, delay 400ms, no arrow.

### 8.14 Dialogs and sheets
Scrim `rgba(22,21,19,.4)` (dark `.6`). Dialog sizes: sm 400, md 560, lg 720. Padding 24. Title `title-2` serif, description `body --text-secondary`. Footer right-aligned: secondary then primary, gap 8. Close `X` ghost icon top-right.

### 8.15 Badges and chips
Badge: h20, padding 0/6, `caption`, `--radius-xs`, bg `--bg-sunken`, text `--text-secondary`. Status badges use `--*-soft` bg + `--*` text. Chips (filter/scope): h28, `--radius-sm`, 1px border, selected = `--accent-soft` bg + `--accent-soft-text` + no border.

### 8.16 Notebook card (home)
h200, bg `--bg-surface`, 1px `--border-default`, `--radius-md`, padding 20. Top: `BookOpen` 18 `--text-tertiary`. Bottom: title serif 18/24 500 (2-line clamp), meta `caption` "12 sources · Edited Oct 19". Hover: border `--border-strong`, bg `--bg-raised`. **No cover gradients, no random emoji.** "New notebook" card: dashed border, `Plus` + "New notebook".

### 8.17 Empty, loading, error states
- **Empty:** left-aligned in pane (centered only on full-page), icon 32 stroke 1.25 `--text-tertiary`, headline serif 18/24, `body --text-secondary` one sentence, one secondary button. E.g. Sources: "Add your first source" / "Upload PDFs, paste links or text. Answers will cite them."
- **Loading:** skeletons matching the real layout, bg `--bg-sunken`, subtle opacity pulse 1.4s (no shimmer gradient). Spinner only for inline actions.
- **Error:** inline banner `--danger-soft` bg, `XCircle` 16, message `body`, retry link. Toasts bottom-right, `--bg-raised`, `--shadow-md`, 4s, max 3 stacked.

### 8.18 Scrollbars & selection
Scrollbar 8px, thumb `--border-strong` radius-full, track transparent, appears on hover. `::selection` bg `--accent-soft`, color `--text-primary`.

## 9. Writing / voice

- Plain, specific, calm. Sentence case everywhere (buttons, titles, menus).
- Verbs on buttons: "Add source", "Generate", "Save to note". Not "Submit", "Click here".
- No exclamation marks, no emoji, no "AI-powered", "magic", "unlock".
- Numbers as digits. Relative times ("2m ago") under 7 days, then "Oct 19".

## 10. Accessibility (non-negotiable)

- Contrast: text ≥ 4.5:1, large text/icons ≥ 3:1 in both themes. Verify accent on surface.
- Every interactive element reachable by keyboard; visible `:focus-visible` ring (§8.1). Never `outline: none` without replacement.
- Icon-only buttons: `aria-label` + tooltip. Live regions for streaming answers (`aria-live="polite"`) and toasts.
- Hit targets ≥ 32px desktop, ≥ 44px touch.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.

## 11. Keyboard shortcuts (show in menus/tooltips with `mono caption`)
`⌘K` command palette · `⌘/` focus composer · `⌘⇧S` toggle Sources · `⌘⇧.` toggle Studio · `⌘↵` send · `Esc` stop/close · `⌘⇧L` toggle theme.

## 12. Theming implementation
- Theme stored in `localStorage` (`theme: light|dark|system`), applied as `data-theme` on `<html>` before paint (inline script in `layout.tsx`) to avoid flash.
- Use `next-themes` with `attribute="data-theme"` if already installed; otherwise the inline script.

## 13. Tailwind mapping

`tailwind.config.ts` — **extend**, map tokens to CSS variables; remove/avoid default palette usage in app code:

```ts
theme: {
  extend: {
    colors: {
      canvas: 'var(--bg-canvas)', surface: 'var(--bg-surface)', raised: 'var(--bg-raised)',
      sunken: 'var(--bg-sunken)', hover: 'var(--bg-hover)', active: 'var(--bg-active)',
      border: { subtle: 'var(--border-subtle)', DEFAULT: 'var(--border-default)', strong: 'var(--border-strong)' },
      fg: { DEFAULT: 'var(--text-primary)', secondary: 'var(--text-secondary)', tertiary: 'var(--text-tertiary)', disabled: 'var(--text-disabled)', 'on-accent': 'var(--text-on-accent)' },
      accent: { DEFAULT: 'var(--accent)', hover: 'var(--accent-hover)', active: 'var(--accent-active)', soft: 'var(--accent-soft)', 'soft-fg': 'var(--accent-soft-text)' },
      success: { DEFAULT: 'var(--success)', soft: 'var(--success-soft)' },
      warning: { DEFAULT: 'var(--warning)', soft: 'var(--warning-soft)' },
      danger:  { DEFAULT: 'var(--danger)',  soft: 'var(--danger-soft)' },
      info:    { DEFAULT: 'var(--info)',    soft: 'var(--info-soft)' },
      src: { pdf: 'var(--src-pdf)', web: 'var(--src-web)', video: 'var(--src-video)', audio: 'var(--src-audio)', doc: 'var(--src-doc)', text: 'var(--src-text)' },
    },
    fontFamily: { serif: ['var(--font-serif)'], sans: ['var(--font-sans)'], mono: ['var(--font-mono)'] },
    fontSize: {
      display: ['36px', { lineHeight: '44px', letterSpacing: '-0.02em', fontWeight: '500' }],
      'title-1': ['28px', { lineHeight: '36px', letterSpacing: '-0.015em', fontWeight: '500' }],
      'title-2': ['22px', { lineHeight: '30px', letterSpacing: '-0.01em', fontWeight: '500' }],
      'title-3': ['18px', { lineHeight: '26px', letterSpacing: '-0.005em', fontWeight: '600' }],
      heading: ['15px', { lineHeight: '22px', letterSpacing: '-0.005em', fontWeight: '600' }],
      'body-lg': ['16px', { lineHeight: '26px' }],
      body: ['14px', { lineHeight: '22px' }],
      small: ['13px', { lineHeight: '20px' }],
      caption: ['12px', { lineHeight: '16px', letterSpacing: '0.01em', fontWeight: '500' }],
      overline: ['11px', { lineHeight: '16px', letterSpacing: '0.06em', fontWeight: '600' }],
    },
    borderRadius: { xs: '4px', sm: '6px', md: '8px', lg: '12px' },
    boxShadow: { sm: 'var(--shadow-sm)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)' },
    transitionDuration: { fast: '120ms', base: '180ms', slow: '260ms' },
    transitionTimingFunction: { out: 'cubic-bezier(.2,.8,.2,1)', in: 'cubic-bezier(.4,0,1,1)' },
  },
}
```
Lint rule (or grep check in CI): fail on `#[0-9a-fA-F]{3,8}` in `components/` and `app/` outside `globals.css`, and on default palette classes (`gray-`, `slate-`, `zinc-`, `neutral-`, `blue-`, `purple-`, `indigo-`, `violet-`).

## 14. File structure (target)
```
app/globals.css            # all tokens (light + dark)
app/layout.tsx             # fonts, theme script
components/ui/             # primitives: button, input, icon-button, menu, dialog, tooltip, badge, chip, skeleton, toast
components/shell/          # top-bar, pane, pane-header, rail, resize-handle
components/sources/        # source-list, source-item, add-source-dialog, source-reader
components/chat/           # message-list, user-message, assistant-message, citation-chip, citation-popover, composer
components/studio/         # tool-grid, tool-tile, output-list, audio-player, note-card, note-editor
components/icons/Icon.tsx  # lucide wrapper (size + stroke defaults)
lib/cn.ts                  # clsx + tailwind-merge
```

## 15. Extending this system (for future custom features)

When adding any new feature (e.g. flashcards, quiz, collaboration, new source type, new Studio tool):

1. **Reuse first.** Build from §8 components. A new feature should need zero new tokens most of the time.
2. **New Studio tool** → add a tile (§8.8) + icon to §6.1 + output row. Output view uses rendered markdown (§8.11) or a documented new component.
3. **New source type** → add row to §2.4 (light + dark, muted, ≥3:1 on `--bg-sunken`) and §6.1.
4. **New component** → add a subsection under §8 using this template:
   ```
   ### 8.x <Name>
   Purpose: one line.
   Anatomy: parts in order.
   Tokens: bg / border / text / radius / shadow / spacing used.
   Sizes & variants:
   States: default, hover, active, focus-visible, disabled, loading, empty, error.
   Behavior & motion:
   Accessibility: roles, labels, keyboard.
   Do / Don't:
   ```
5. **New token** → only if no existing token fits. Add to §2–§7 for **both themes**, map in §13, note it in §16.
6. Never introduce a second accent. Feature differentiation comes from icons and labels, not color.

## 16. Changelog
- v1.0 — Initial warm-editorial system (3-pane shell, sources, chat with citations, studio, notes, audio).
