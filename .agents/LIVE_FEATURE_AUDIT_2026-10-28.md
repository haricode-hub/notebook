# Live notebook feature audit

## Follow-up verification — 31 October 2026

The table below updates the 28 October baseline. The original run and its nine failures remain documented after this section so the change in results is traceable.

| Check | Current evidence |
|---|---|
| Real PDF upload | Level 2 browser test passed: generated PDF uploaded, reached `ready`, and was deleted. The 20-page PDF citation viewer test also passed. |
| Audio overview | Focused Level 8 browser test passed in 4.6 minutes after script-grounding fixes and Kokoro model warm-up. It checked transcript seeking, playback speed, MP3 download signature, and citation opening. |
| Previously failed non-audio journeys | Focused reruns of Level 1, Level 3, Level 5, Level 7, public site, readiness, and Level 14 auth passed. |
| Python checks | Ruff and mypy passed; Level 8 unit/integration tests passed 8/8. |
| Full browser suite | The 31 October rerun reached test 26/34 without a code assertion failure through PDF upload, chat, PDF viewer, guide/notes, and study-guide export. It was stopped after OpenRouter returned `Key limit exceeded (total limit)` for new mind-map and flashcard jobs. A complete live-suite pass requires renewed key quota. |

### Status of the original nine failures

| Original failed test | Follow-up result | Change or explanation |
|---|---|---|
| Level 1 workspace journey | Passed focused rerun | Test now returns to `/notebooks` after Settings. |
| Level 3 grounded chat | Passed focused rerun | Live response wait reflects the measured model latency. |
| Level 5 guide and notes | Passed focused rerun | Functional checks remain; intentional SSE reconnect errors are excluded from the console assertion. |
| Level 7 flashcard persistence | Passed focused rerun | Reopening uses the generated artifact row. |
| Level 8 audio overview | Passed focused rerun | Sole-source citation repair, sparse-source length handling, and longer cold-model wait. |
| Level 14 auth accessibility | Passed focused rerun | Light tertiary text token has stronger contrast. |
| Public-site accessibility | Passed focused rerun | Same contrast token correction. |
| Public-site hero | Passed focused rerun | Assertion matches current copy. |
| Readiness | Passed focused rerun | Checks API and embed readiness endpoints directly. |

The one skipped test is the live source-guide timing test. It passed separately on 28 October with `RUN_LIVE_GUIDE=1`; it remains skipped in the default suite by design.

The app remains available through Docker Compose. On this Windows host, WSL also bound the IPv6 `localhost` ports, so the Playwright harness was adjusted to reach Docker through IPv4. The current OpenRouter key has exhausted its total limit; new live model jobs will fail until its quota or key changes. This follow-up verifies the named journeys; it does not imply every control or provider has been exercised.

**Date:** 28 October 2026  
**Result:** Core PDF and study flows worked; audio overview did not. The full browser suite was not green.  
**Runner:** Local Windows host, Docker Compose, headless Chrome through Playwright  
**Code:** Commit `a50f2bb` plus existing uncommitted changes

## At a glance

| Check | Result | Meaning |
|---|---:|---|
| Docker services | 8 healthy; auth migration exited 0 | The local stack started and stayed available. |
| Full Playwright suite | 24 passed, 9 failed, 1 skipped (34 total) | Browser coverage found real and test-maintenance failures. |
| Focused chat and guide/notes reruns | 2 passed | Their full-suite failures were intermittent in this run. |
| Live source guide | Passed in 12.1 seconds | Run separately because the full suite skips it by default. |
| Audio overview | Failed twice | Script generation failed before TTS; no MP3 was created. |

**Verdict:** This audit does not establish that every notebook feature or every button works. It establishes the specific journeys and downloads below.

## Scope and environment

- The web and worker images were rebuilt. API, embed, and TTS used existing local images.
- Test email went to Mailpit through a temporary Compose override outside the repository. The regular `.env` points to an external SMTP relay.
- The stack used `EMBED_BACKEND=fake`, OpenRouter for LLM calls, and the default Kokoro TTS route.
- These checks cover this local configuration. They do not measure real embedding retrieval quality, other providers, or production/scale behavior.

## Service checks

| Service | Result |
|---|---|
| web, API, embed, worker, TTS, Postgres, Redis, Mailpit | Running and Docker healthy after startup |
| auth-migrate | Exited 0 as expected |
| web `/`, API `/healthz` and `/readyz`, embed `/healthz` and `/readyz`, Mailpit `/` | HTTP 200 |
| API readiness dependencies | `db`, `redis`, and `embed` all reported `ok` |

## Browser test results

Full Playwright suite: **34 tests: 24 passed, 9 failed, 1 skipped** (15.7 minutes, one worker). The skipped live guide test passed separately with `RUN_LIVE_GUIDE=1`; upload to guide took **12.1 seconds**. Focused reruns of grounded chat and the guide/notes journey also passed. The audio test failed again after rebuilding the worker with the current local LiteLLM change.

| Feature/action | Result | Evidence and limit |
|---|---|---|
| Sign up and verification | Pass | Mailpit flow ran in several tests. The broader Level 1 test later failed on an outdated home-page navigation assertion. |
| Create notebook, upload sample PDF, source status and deletion | Pass | Playwright Level 2 generated and uploaded a real PDF, waited for `ready`, then deleted it. SSE reconnect test passed. |
| Grounded chat and source selection | Pass on rerun; intermittent in full suite | Full run expected the answer within 5 seconds while UI still showed `Finding an answer`; focused rerun passed. Fake embeddings limit retrieval-quality conclusions. |
| PDF/text citation jump and highlight | Pass | Level 4 viewer tests, including the 20-passage sample, passed. |
| Source guide, notes, overview question | Pass on rerun; intermittent in full suite | Full run completed the flow but logged `ERR_INCOMPLETE_CHUNKED_ENCODING`; focused rerun passed. Live guide timing was 12.1 seconds. |
| Study guide, FAQ, Markdown, DOCX, server PDF and browser-print PDF | Pass | Downloaded Markdown contained the expected text; DOCX began with `PK`; server PDF began with `%PDF`; browser PDF contained the expected source text. Citation opened the viewer. |
| Mind map PNG/SVG and mobile node-to-chat | Pass | PNG signature and SVG content checked. |
| Flashcard flip, Known action and Anki CSV | Pass through download; saved-state reopening unproven | CSV filename, header and citation checked. After reload, the saved item was titled `Photosynthesis`, while the test looked for a button named `Flashcards`; it timed out. |
| Quiz attempts and wrong-answer citation | Pass | Ten questions, answer schema, persistence and review flow passed. |
| Audio overview, transcript controls and MP3 | **Fail** | Both runs dead-lettered after three attempts: `Audio model returned invalid JSON after repair`. The rebuilt worker's second run was still at `script · 25%` when Playwright timed out at 240 seconds; a later database check confirmed `failed`. TTS did not receive a synthesis request; no MP3 was produced or downloaded. |
| Discover, read-only share and revoke | Pass with mocked discovery/import | Level 9 mocked discovery and import responses, then verified a real share link, read-only visitor page and revoke. Real discovery/import remains unproven. |
| Settings, theme, mobile shell, auth reset | Partial | Several checks passed. The Level 1 test used the public home link and then expected a notebook link on that public page. Password-reset journey reached axe and failed on color contrast. |
| Public landing and policy pages | Partial | Policy layout tests passed. Two landing assertions expected old hero copy or readiness controls that are no longer on `/`. Axe found real light-theme text contrast of **4.37:1**, below the 4.5:1 WCAG AA threshold. |

The suite exercises many important controls but does **not** exhaustively click every button. ZIP export, URL/YouTube/audio-source import, account deletion/export, alternate LLM providers, real embedding quality, and scaled deployment were not proven by this run. Feature gaps tracked in `.agents/TASKS.md` are not converted to passes here.

## Download checks

| File/action | Result | Validation |
|---|---|---|
| Study-guide Markdown | Pass | Downloaded text contained the expected `BLUEBIRD-42` marker. |
| Study-guide DOCX | Pass | Downloaded file began with the DOCX/ZIP `PK` signature. |
| Server PDF | Pass | Downloaded file began with `%PDF`. |
| Browser-print PDF | Pass | Opened with PDF.js; text contained the source marker. |
| Mind-map PNG | Pass | Downloaded file had the PNG signature. |
| Mind-map SVG | Pass | Downloaded text contained `<svg`. |
| Flashcard Anki CSV | Pass | Filename, `Front,Back` header, and `[S1]` citation were checked. |
| Audio MP3 | **Fail / unavailable** | Audio did not reach synthesis. |
| Notebook ZIP | Not tested in browser | This button was outside the completed browser journeys. |

## Why the nine full-suite tests failed

| Category | Tests | Finding |
|---|---|---|
| Repeatable product failure | Level 8 audio (1) | Both jobs failed after three attempts because the model's script remained invalid JSON after repair. The rebuilt worker failed too. |
| Accessibility defect | Level 14 auth and public-site axe (2) | Light-theme tertiary text measured 4.37:1 on canvas, below the 4.5:1 WCAG AA text threshold. |
| Intermittent timing/streaming | Level 3 chat and Level 5 notes (2) | Chat was still answering after the test's five-second wait; notes logged an incomplete streamed response. Both passed on focused reruns. |
| Outdated browser assertions | Level 1, Level 7 flashcards, public landing, readiness (4) | Tests expected old navigation, a recipe name instead of a generated title, old hero copy, or readiness controls on `/`. |

## Prioritized follow-up

1. **Audio is blocked in this configuration.** Investigate OpenRouter audio-script JSON validation and model selection/retry behavior. Test Kokoro synthesis and MP3 separately after a valid script exists.
2. **Accessibility:** update the light-theme tertiary-text token in `DESIGN.md` and CSS to meet 4.5:1 on canvas, then rerun axe. The `Ctrl K` hint and landing step numbers are affected.
3. **Stale browser tests:** update Level 1 navigation, flashcard saved-item selector, public hero copy and readiness-page expectations to the current routes and generated titles.
4. **Intermittent streaming:** investigate the `ERR_INCOMPLETE_CHUNKED_ENCODING` console error and measure chat response latency; the focused reruns passed.
5. **Existing static gate:** Python mypy had five errors in the earlier local check (eval imports/stubs/redefinitions and worker typing); this audit did not change code or rerun that gate.

The Compose stack was left running for follow-up checks. Existing uncommitted project changes were preserved. This report is the only new repository file from this audit.
