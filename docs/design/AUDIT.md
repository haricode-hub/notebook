# UI redesign audit

The root [DESIGN.md](../../DESIGN.md) is the visual source of truth. This audit records the app surface inventory, issues found during the redesign, and how each surface maps to the design system.

## Routes

| Route | Surface | Design target |
|---|---|---|
| `/` | Public landing page | Home / editorial entry |
| `/sign-in`, `/sign-up` | Authentication | Auth shell and form primitives |
| `/forgot-password`, `/reset-password` | Account recovery | Auth shell, form states, inline feedback |
| `/notebooks` | Notebook library | Home list/grid, search, sort, create card |
| `/workspace/[id]` | Research workspace | Three pane desktop; chat + switchable side pane on tablet; bottom tabs on phones |
| `/settings` | User preferences and account security | Settings sections and form primitives |
| `/admin` | Operations view | Tables, status badges, loading and error states |
| `/share/[token]` | Public read-only notebook | Reading column, citations, notes |
| `/design-preview` | Temporary design review surface | Both theme variants of each shared primitive |
| `/api/auth/[...all]` | Better Auth route | API endpoint; no UI |

## UI component inventory

- Shells and navigation: `auth-shell`, `account-nav`, `sign-out-button`, `theme-toggle`, protected layout, notebook list, workspace page.
- Research: `sources-panel`, `source-viewer`, `source-text-block`, `pdf-original`, `chat-panel`, `cited-markdown`.
- Studio: `studio-panel`, `artifact-studio`, `note-editor`, `audio-player`, `flashcards-view`, `quiz-view`, `mindmap-view`.
- Account and operations: `auth-form`, `account-security`, settings page, `admin-overview`, readiness page, public share page.
- Shared primitives: `Button`, `IconButton`, `Input`, `Textarea`, `SearchInput`, `Select`, `Label`, `Menu`, `MenuItem`, `Tooltip`, `Dialog`, `Sheet`, `Badge`, `Chip`, `Skeleton`, `Spinner`, `InlineBanner`, `Checkbox`, `Toggle`, `Tabs`, `Material`, and the `Icon` wrapper.

## Findings and changes

| Finding | Change |
|---|---|
| UI files mixed slate, indigo, amber, red, and green Tailwind palette utilities | Replaced interface colors with semantic surface, border, accent, status, and source tokens |
| Components rendered lucide glyphs directly and used inconsistent icon sizes | Routed rendered glyphs through `components/icons/Icon` with 1.5 stroke and a 16 px default |
| A stale unused `src/design/tokens.css` retained a different monochrome/blue theme | Removed the unused stylesheet; active tokens live in `app/globals.css` and Tailwind mappings |
| Default Tailwind text sizes appeared across UI screens | Replaced with the design type scale; editorial titles use Source Serif 4, body uses Geist, metadata uses Geist Mono where appropriate |
| Arbitrary layout values remained in the audio transcript, mind map, and artifact dialog | Moved these values into named CSS layout classes; retained the specified 68ch reading measure |
| Tablet widths rendered three narrow panes | Added the 768–1199 px chat + switchable Sources/Studio layout; three resizable panes begin at 1200 px; phone bottom tabs remain below 768 px |
| Modal keyboard handling did not guarantee Escape dismissal or focus containment | Dialog and Sheet now move focus into the overlay, contain Tab focus, close on Escape, and restore prior focus |
| Workspace had no discoverable shortcut entry point | Added a command menu available with Ctrl/Cmd+K and from the workspace header |
| Primary button text inherited body ink because Tailwind Merge treated the size and foreground utilities as conflicting | Kept the foreground token on the shared button primitive as a semantic CSS utility; verified the rendered light-theme primary action computes to white on terracotta |
| Composer source-count control looked interactive but had no behavior | Added a source checklist that updates the same selected-source state as the Sources pane |
| Empty composer send button stayed accent-colored and looked active | Applied the disabled composer colors from DESIGN.md: sunken fill and disabled text |
| Select controls showed the browser's default chevron and option colors, and long model names wrapped on phones | Replaced native selects with a keyboard-accessible Radix select using the shared field height, focus ring, chevron, menu surface, and option states; selected values truncate cleanly at narrow widths |
| Sources toolbar clipped its primary action at desktop widths, while Studio tiles were cramped | Set the default desktop split to Sources 18%, Chat 54%, Studio 28%; the Sources action switches to an icon with an accessible label in narrow panes, and divider limits match the new proportions |
| Pane headings and the phone brand felt heavy or wrapped | Reduced pane heading weight to medium, kept the brand ink-colored, and shortened its phone label so it stays on one line |
| A few specialized controls had their own field styling | Audio speed and PDF page navigation now use the shared `Select` and `Input` primitives; the chat composer retains its larger purpose-built writing surface |

All displayed screens map to the matching sections in DESIGN.md: Home, Auth, Workspace, Sources, Chat, Studio, Settings, and shared dialogs. Workspace pane separation uses 8 px canvas gaps and rounded panes consistently.

## Token and style audit

`corepack pnpm lint:design` checks all application source files for raw color literals outside `globals.css`, default palette utilities, decorative gradients, backdrop blur, banned large radius/shadow utilities, default type sizes, arbitrary sizes/radii/shadows, emoji glyphs, unwrapped JSX icons, font loading, dark theme tokens, and reduced-motion support. The latest measured run passed for 72 source files.

No new color, radius, shadow, type, or motion tokens were added beyond those in DESIGN.md. Named layout classes cover the few explicit viewport-based sizes already called for by the UI.

## Review notes

- The design-preview route is intentionally temporary and can be removed after visual approval.
- The current 48-image matrix is in `docs/design/current/`; chat answers in these screenshots are FAKE visual fixtures. The capture script resolves this path from its own location.
- Contrast ratios have not been measured numerically. The browser pass covered the main layout, selected citation viewer, settings, and dialog dismissal, but did not exhaustively keyboard-test every screen.
- In a 1280 px-wide screenshot the Sources pane intentionally renders its add action as a plus icon to protect the reading width; the accessible name remains “Add source” and the full label appears at wider desktop sizes.
