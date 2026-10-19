# Status and Gap Analysis (from the 13 files in `.agents/`, as of 2026-10-19)

Scope note: this review is based on the reports, TASKS, PLAN and PROGRESS files only. I did not read the source code, so anything marked "verify" should be confirmed in the repo.

## 1. Headline

The build is far ahead of most projects at this stage: Levels 1-8 are implemented and verified with tests, Level 9 Pass A/B is implemented, Level 10 implementation is done. The agent was also honest: it refused to emit `L10_COMPLETE` and kept the failing Level 0 criterion open instead of editing it.

What is NOT done: the runtime proof. Several levels passed on fake backends or synthetic data, and the final gates (load, scale, e2e on the scale stack, VPS) have never run because Docker could not start on the Windows host.

## 2. Status by level

| Level | Status | What is proven | What is still unproven or missing |
|---|---|---|---|
| 0 Foundation | OPEN (1 failing check) | 29 tests, CI green, warm start 22.1 s, readyz/ping/types | Cold clean-clone start measured 402.2 s vs 90 s target (image build dominates) |
| 1 Auth/shell | Done | JWT/JWKS, ownership, encryption, e2e | No `LEVEL_1_REPORT.md` file (only a PROGRESS note) |
| 2 Ingestion | Done with caveats | Real model: 100 pages in 213 s, 2.64 GiB RSS | Denser PDFs exceeded 4 min; Docling not used, so scanned PDFs need OCR (not built) |
| 3 Grounded chat | Done with a caveat | First token 2.346 s live | The 100% hit-rate eval used deterministic fake vectors, not the real embedding model |
| 4 Viewer | Done | 20-sample highlight, 300-page PDF, signed URL tests | No `LEVEL_4_REPORT.md` file |
| 5 Guides/notes | Done | Cache, debounce, live 20.8 s guide | Timing run used fake embeddings |
| 6 Text artifacts | Done with caveats | Recipes, repair retry, MD/DOCX, print-PDF | 50-page benchmark used FakeLLM; no live 50-page run; server-side PDF (WeasyPrint) not available on the Windows host |
| 7 Interactive | Done | 3 e2e journeys, 10 quiz questions manually checked | none significant |
| 8 Audio | Partly proven | Pipeline, player, FakeTTS e2e | Real Kokoro inference never run; the 6-minute and offline Ollama+Kokoro criteria are unmeasured |
| 9 Advanced sources | Pass A/B built, Pass C OPEN | Fixture tests, SSRF reuse, hashed share tokens | No browser/security e2e for share, discover, export; 20-min YouTube and 10-min audio acceptance numbers not recorded; no `LEVEL_9B/9C` report |
| 10 Hardening | Implementation done, runtime gates OPEN | CI: Python, Web, Gitleaks, both dependency audits; 112 tests | k6, scale-stack e2e, workspace axe, VPS rehearsal, EXPLAIN review, worker-kill recovery, live fallback-model test |

## 3. Findings, ranked

### Critical (they can hide real defects)
1. **Retrieval quality is not actually measured.** The Level 3 eval (15/15) uses deterministic token vectors, and the Level 10 eval reports 100% on four metrics for a 30-question fixture. Perfect scores on a small, easy, synthetic set usually mean the eval is too easy, not that the system is perfect. It needs real embeddings, messy real documents, multi-hop and negative questions, and a judge model from a different family than the answering model.
2. **No Linux runtime has ever run the full stack under load.** Everything on the "scale" path (3 web + 3 API + MinIO, shared sessions, S3 files, rate limits across replicas) is statically validated only.
3. **E2E tests are not in CI.** CI runs Python, Web build/tests, Gitleaks. Playwright ran locally and serially (rate limits on a shared stack). So regressions in any journey can merge unnoticed, which matters a lot before a UI overhaul.
4. **Level 0 acceptance is red** and nobody has made a decision on it.

### High
5. **Scanned PDFs and images are unsupported** (no OCR). Many real study documents are scans.
6. **Real Kokoro audio never ran**; TTS is in a separate Python 3.12 service, so its resource use, speed and quality are unknown.
7. **Auth is incomplete for real users:** password reset, email verification and account deletion/data export are not in any level (needs an email provider).
8. **Markdown/HTML rendering safety** (chat markdown, notes/Tiptap, share page, artifact viewer) has no explicit XSS test listed. CSP exists, but it should be tested directly.
9. **Branch/release hygiene:** work is spread across branches (`level-N-...`, `complete-missing-level-work`); I could only confirm PR #1. Merge, tag and protect `main` so CI gates are real.

### Medium
10. YouTube transcript retrieval is often blocked or rate-limited from datacenter IPs; the yt-dlp fallback may need cookies or fail. Test from the real deployment host.
11. Dev experience on Windows: no `make`, bash `loop.sh` will not run natively, temp-dir permission errors, Docker Desktop service stopped. Use WSL2 or a Linux dev container, or provide PowerShell equivalents.
12. `LOOP_PROMPT.md` in the zip is stale: `CURRENT_LEVEL = 0` and it lost the one-task-per-run, report and `<promise>` rules.
13. Tech debt: 3 persistent React Compiler lint warnings (chat/source viewer hooks), mypy excludes tests (add `types-boto3`), Playwright forced to 1 worker.
14. Missing report files (`LEVEL_1`, `LEVEL_4`, `LEVEL_9B`, `LEVEL_9C`) and `FINAL_REPORT.md` is referenced but not in the zip.
15. Per-user settings "persona / response length" were stored in Level 1: verify they are actually applied in chat and artifacts.

### Product gaps versus NotebookLM (not covered by Levels 0-10)
Slide deck / video overview, "deep research" report mode, Google Drive/Docs import, i18n of the UI, command palette and keyboard shortcuts, answer feedback (thumbs) for quality tracking, multi-user collaboration (share is read-only), notebook search, undo for destructive actions.

## 4. Recommended order

1. **Level 11: Close the open gates** (environment, CI e2e, Level 0 decision, Level 9 Pass C, Level 10 runtime gates, missing reports, branch hygiene)
2. **Level 12: Real quality and reliability** (honest evals with the real model, OCR, live Kokoro/YouTube/Whisper checks, XSS audit)
3. **Level 14: Apple-style UI overhaul** (after CI e2e exists, so the redesign cannot silently break journeys)
4. **Level 13: Missing product features** (auth completeness, slide deck, deep research, shortcuts, etc.)

You can start Level 14 as soon as task 11.3 (e2e in CI) is green.

## 5. Decision needed from you (Level 0)

The 90-second target is currently measured including the first image build, which takes 402 s on Windows Docker Desktop. A cold build always downloads dependencies, compiles Next.js and (for embed) pulls PyTorch and the model, so 90 s is unrealistic for a build. Two ways forward, both in Level 11:
- **Option A (recommended):** amend the criterion to "warm start (images present, model cache warm) healthy in 90 s" which already passes at 22.1 s, and add a separate cold-build budget (for example under 5 minutes on a Linux CI runner) with cache mounts and prebuilt images.
- **Option B:** keep it strict by publishing prebuilt images to GHCR and having `docker compose up` pull them. Pull time depends on your network and the embed image size, so it may still miss 90 s.
