# Tasks

## Overall status (2026-10-19)

**Not all levels are complete in this checkout.** Level 3 is verified, including the live OpenRouter first-token target (2.346 s). Level 9 Pass B and its focused tests pass. Level 10 Python, Web, Gitleaks, dependency-audit, typecheck, and test workflows now pass on CI. Remaining work: Level 0's clean-clone cold-build target (0.10), Level 9's browser/security e2e run (C.1), and Level 10's Docker/scale/VPS runtime gates. Docker Engine cannot start on this host; the 10-minute k6 and VPS rehearsal also need their target runtime. See `.agents/PROGRESS.md` for results and limits.

## Level 0: Foundation

- [x] 0.1 Document the level plan, tasks, and ADRs (<=2h)
- [x] 0.2 Create uv workspace, Python 3.13 lockfile, and lint/type/test configuration (<=2h)
- [x] 0.3 Implement config, database models/session, Alembic migration and auth-table exclusion (<=2h)
- [x] 0.4 Implement storage, queue, LLM, embedding, TTS and search contracts (<=2h)
- [x] 0.5 Build FastAPI health/readiness, middleware, logging, and errors (<=2h)
- [x] 0.6 Build fake embed service and Gemma 2 stub (<=2h)
- [x] 0.7 Build arq worker and persisted ping job (<=2h)
- [x] 0.8 Scaffold Next.js, Tailwind, shadcn, typed readiness page and smoke test (<=2h)
- [x] 0.9 Add Dockerfiles, Compose, Makefile, and CI (<=2h)
- [ ] 0.10 Add >=15 meaningful tests, verify all acceptance tests, record report and commit (<=2h)

## Level 1: Auth, notebooks, shell and settings

- [x] 1.1 Verify current auth/LLM integration APIs and record ADR-004
- [x] 1.2 Add Better Auth server/client config, schema migration, env and Compose wiring
- [x] 1.3 Add sign-in/up/out and protected Next.js routes
- [x] 1.4 Add JWKS verification and isolated notebook CRUD in FastAPI
- [x] 1.5 Add encrypted user settings, model listing and provider connection checks
- [x] 1.6 Add typed browser API client, notebook list and workspace shell
- [x] 1.7 Add settings UI, theme, toasts and loading states
- [x] 1.8 Verify JWT/ownership/settings tests, Playwright journey and all gates; commit

## Level 2: Ingestion and embeddings

- [x] 2.1 Verify EmbeddingGemma 2 documentation and Python 3.13 dependencies; write ADR-005
- [x] 2.2 Load and warm the text-only FP32 embedding backend; preserve fake backend
- [x] 2.3 Add source/chunk schema, HNSW/GIN indexes, extractors, and offset-safe chunking
- [x] 2.4 Add source API, SSRF-safe fetching, upload limits, worker stages, events, and atomic reindex
- [x] 2.5 Add source panel, upload progress, retry/delete, and token-refreshing SSE
- [x] 2.6 Pass all gates, 100-page benchmark, and Playwright journeys; record report and commit

## Level 3: Grounded chat

- [x] 3.1 Add selected-source schema and owned hybrid/full-context retrieval
- [x] 3.2 Add grounded prompt, citation validation, and chat persistence
- [x] 3.3 Stream owned chat over SSE with limits and cancellation
- [x] 3.4 Add typed chat UI, citation chips, source selection, history and clear
- [x] 3.5 Add unit/integration tests and a 15-question offline evaluation
- [x] 3.6 Pass all local gates and browser journey; record report and commit (live OpenRouter first token: 2.346 s)

## Level 4: Source viewer

- [x] 4.1 Add owned content endpoint and expiring, user-bound signed PDF URLs
- [x] 4.2 Build virtualized PDF and Text source viewer with citation highlighting
- [x] 4.3 Connect citation and source controls, navigation, rename and details
- [x] 4.4 Verify offset mapping, signed URLs, 20 citation samples and 300-page PDF
- [x] 4.5 Pass lint, types, tests, production build and browser journeys; record report and commit

## Level 5: Source guides and notes

- [x] 5.1 Add versioned, token-budgeted map-reduce guides and content/model cache
- [x] 5.2 Queue source guides and debounced notebook overviews
- [x] 5.3 Add owned notes CRUD, saved chat citations, and conversion to sources
- [x] 5.4 Build guide, overview, and client-only Tiptap Studio UI with Markdown export
- [x] 5.5 Pass unit, integration, browser, and live timing checks; record report and commit

## Level 6: Text study artifacts

- [x] 6.1 Add versioned recipe registry, artifact schema, map-reduce generation, citation validation, and one repair retry
- [x] 6.2 Add owned artifact CRUD/exports, queued worker stages, progress events, and regeneration
- [x] 6.3 Build Studio tiles, options, cited viewer, live status, downloads, and print/PDF path
- [x] 6.4 Document the add-studio-generator skill, prompts, and ADR-009
- [x] 6.5 Pass all gates and browser journey; record report and commit

## Level 7: Interactive study artifacts

- [x] 7.1 Add versioned mind map, flashcard, and quiz recipes with strict schemas and citation validators; record React Flow ADR
- [x] 7.2 Persist Leitner progress and quiz attempts with owned API routes and Alembic migration
- [x] 7.3 Build interactive renderers, node-to-chat, and PNG/SVG/Anki CSV exports
- [x] 7.4 Add schema, scheduling, scoring, persistence, and ownership tests
- [x] 7.5 Pass Python/web gates and all three Playwright interactions; record report and commit

## Level 8: Audio overview
- [x] 8.1 Check Kokoro's Python 3.13 support and isolate the Python 3.12 TTS service with ADR-011
- [x] 8.2 Add Kokoro/OpenAI/Fake providers, audio prompts, schema validation, faithfulness filtering, and Redis concurrency lease
- [x] 8.3 Add staged audio artifact worker, ffmpeg MP3 stitching, storage, cancellation, download, and progress events
- [x] 8.4 Build the audio player with synced transcript, seek, speed, download, citations, and cancel/regenerate actions
- [x] 8.5 Pass Python/web gates and FakeTTS Playwright journey; record report

## Level 9: Advanced sources and sharing
- [x] A.1 Verify faster-whisper, yt-dlp, and youtube-transcript-api install and import on Python 3.13.5
- [x] A.2 Add YouTube transcript-first and Whisper fallback ingestion, audio uploads, and chunk timestamps
- [x] A.3 Add time-aware citations/viewer, SearchProvider discovery, and SSRF-safe import
- [x] A.4 Add hashed/revocable read-only share links, public page, strict rate limits, and ZIP export
- [x] A.5 Pass local Python/web checks and fixture tests; commit Pass A (browser/security journeys remain in Pass C)
- [x] B.1 Re-read official EmbeddingGemma 2 multimodal documentation and record ADR-006 measurements
- [x] B.2 Add gated media embeddings, figure extraction, media_items and per-modality RRF
- [x] B.3 Add figure citations to chat and source viewer
- [ ] C.1 Complete unit, integration, security, and e2e coverage; run all gates and commit Pass C

## Level 10: Hardening and scaling
- [x] Pass 1: eval expansion, faithfulness, RAG tuning, OpenRouter comparison
- [x] Pass 2: retries, dead-letter visibility, fallback, caches, shutdown, backup, cleanup
- [x] Pass 3: authorization sweep, auth hardening, headers, admin/quotas, audit automation
- [x] Pass 4 implementation: k6 profile, scale Compose/S3, scaling docs, sample notebook, axe checks
- [ ] Pass 4 runtime gates: 10-minute k6, scaled full e2e, workspace axe, VPS rehearsal
- [x] Verify the Python dependency audit passes in CI after switching from unsupported `uv.lock` discovery to exported locked requirements (root + Python 3.12 TTS)

## Level 11: Close the Open Gates

- [x] 11.1 Choose and document the Linux proof runner; add Windows `dev.ps1` and one-task `loop.ps1`
- [ ] 11.2 Add fake-backend Playwright e2e workflow with failure traces and parallelizable tests
- [ ] 11.3 Optimize Level 0 build layers/cache, publish CI images, and measure cold/warm/pull startup
- [ ] 11.4 Complete Level 9 Pass C browser/security tests and record source timing measurements
- [ ] 11.5 Add and run Linux scale acceptance for Compose, k6, axe, EXPLAIN, recovery, admin, fallback, and backup/restore
- [ ] 11.6 Complete VPS runbook and rehearsal if a target is available
- [ ] 11.7 Complete report, branch/tag, type/lint, and loop-prompt hygiene

## Level 12: Real Quality and Reliability

- [x] 12.1 Build 12-document real corpus + 60 questions with isolated held-out split; held-out remains unevaluated
- [x] 12.2 Implement the real-stack harness + dev baseline + nightly workflow; held-out gate remains open
- [x] 12.3 Run and log one-variable retrieval experiments on development data; held-out untouched
- [x] 12.4 Measure dense-PDF stages and add ETA (browser verification remains open)
- [x] 12.5 OCR scanned PDFs and image uploads with local citation-mapping tests; Linux/browser checks open
- [ ] 12.6 Measure live Kokoro, YouTube transcript/fallback, and CPU Whisper behavior
- [ ] 12.7 Add and test Linux server-side PDF export
- [ ] 12.8 Add XSS, prompt-injection, SSRF, and upload-fuzz regressions and fixes
- [ ] 12.9 Verify persona and response-length settings change chat and artifact outputs

## Level 13: Missing Product Features

- [ ] 13.1 Complete account recovery, email verification, session management, account deletion and export (PARTIAL: local implementation/tests pass; Mailpit lifecycle and Playwright remain open)
- [ ] 13.2 Add command palette and keyboard shortcuts
- [ ] 13.3 Add answer feedback, admin view and eval export
- [ ] 13.4 Add cross-notebook search
- [ ] 13.5 Add slide deck generation and exports
- [ ] 13.6 Add bounded deep research mode
- [ ] 13.7 Add URL source refresh and duplicate detection
- [ ] 13.8 Add Google Drive import or explicitly defer
- [ ] 13.9 Add UI localization and chat output language
- [ ] 13.10 Add notebook collaboration or explicitly defer

## Level 14: Apple-style UI overhaul

- [ ] 14.1 Install/read requested design skills, record ADR-015, and verify prerequisite 11.2 (skill read; Level 11.2 remains open)
- [x] 14.2 Add design tokens, preference hook, springs, and Material fallbacks
- [ ] 14.3 Add global press feedback, visible focus, and 44 px targets
- [ ] 14.4 Workspace panels, mobile sheet, soft delete, undo and delayed purge
- [ ] 14.5 Chat composer, streaming stability, and citation transitions
- [ ] 14.6 Studio and artifact interaction polish
- [ ] 14.7 Auth/settings/toast polish and development-only design lab
- [ ] 14.8 Accessibility, performance, Playwright visual evidence, and report
