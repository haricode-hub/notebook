# LEVEL 4: Source Viewer and Citation Jump

Prerequisite: `AGENTS.md`; Levels 0-3 complete.

## Feature name
Click a citation, see the exact passage highlighted in the source.

## Objectives and goals
- Make the app trustworthy: precise, instant, reliable jumps.

## Scope
- `GET /sources/{id}/content`: normalized text + chunk offset map; PDFs also return a signed, expiring, user-bound file URL.
- Viewer drawer: "Original" tab (react-pdf with text layer; client-only; dynamic import; pdf.js worker configured for Next.js) and "Text" tab (virtualized).
- Citation click: open viewer, scroll to the cited chunk, highlight by offsets (Text tab) or page + fuzzy text match (PDF tab) with a fallback card when matching fails.
- Web sources show cleaned article + original link; pasted text plain view.
- Rename source, details popover; keyboard: Esc closes, arrows move between citations.

## Agent Prompt
```
Read AGENTS.md and this file. Levels 0-3 are done. Execute LEVEL 4 only.
Use Context7 for react-pdf + pdf.js worker setup under the installed Next.js version (client-only, next/dynamic with ssr:false, bundler-safe worker config).
Implement GET /sources/{id}/content and signed file URLs via StorageBackend.url() (expiring, bound to user_id). Build the SourceViewer drawer: PDF tab (page virtualization, zoom, navigation) and Text tab (virtualized). Highlight by offsets for text; for PDFs by page + fuzzy match of the chunk's first/last 80 chars with a graceful fallback card. Wire chips/hover cards from Level 3 to open the viewer at the right spot with next/previous citation navigation. Add rename + details popover.
Tests: unit tests for offset-to-highlight mapping; component tests; Playwright e2e: ask, click [1], assert viewer open, cited text highlighted and in viewport.
Performance: a 300-page PDF opens without freezing.
Output <promise>L4_COMPLETE</promise> when acceptance tests pass.
```

## Task checklist
- [x] content endpoint + signed URLs
- [x] SourceViewer drawer (PDF + Text tabs)
- [x] offset highlighting + PDF fuzzy highlight + fallback card
- [x] citation navigation + keyboard
- [x] rename + details
- [x] tests + e2e + `next build` check

## Acceptance tests
1. For 20 sampled eval citations the highlighted text contains the cited chunk text (>= 95% Text tab; >= 90% PDF tab; the rest show the fallback card).
2. A cached source opens in under 500 ms.
3. 300-page PDF scrolls smoothly; memory bounded via virtualization.
4. Keyboard navigation works; Esc closes.
5. Another user's or an expired signed URL returns 403/404.
6. `next build` succeeds with no SSR errors from pdf.js.

## Working condition
"Every citation I click lands on the right place, and I trust the answers."
