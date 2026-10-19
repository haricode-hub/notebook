# LEVEL 12: Real Quality and Reliability

Prerequisite: Level 11 complete (CI e2e green).

## Feature name
Honest evaluation with the real stack, OCR for scans, live verification of audio/YouTube/Whisper, and an XSS/security re-test.

## Objectives and goals
- Replace "100% on a tiny synthetic set" with numbers that can actually go down.
- Support the documents people really upload (scans, tables, long PDFs).
- Prove the heavy optional features run for real.

## Scope
1. **Real eval harness.** Use the real EmbeddingGemma 2 backend and a real chat model. Build a 60+ question set over 10-12 real, messy documents (long PDF, scanned PDF, tables, slides, web articles, a transcript), including: multi-hop questions, questions with numbers/tables, questions answerable by two sources, negative questions (answer not present), adversarial/injection documents, and near-duplicate distractors. Hold out a test split that is never used for tuning. Metrics: hit-rate@k, MRR, citation validity, citation precision (does the cited chunk really support the claim), faithfulness and relevance judged by a model from a different family than the answering model, refusal accuracy on negatives. Fail CI nightly on regression beyond a threshold.
2. **Retrieval experiments** (one variable at a time, logged in ADR): chunk size/overlap, top-k, reranker on/off (try a local bge reranker), query rewriting on/off, embedding dimension 768/512/256, hybrid weights.
3. **Speed on dense PDFs.** Profile embedding throughput (batch size, ONNX/quantized option, truncation) and record time for a dense 100-page PDF; show per-stage progress and an ETA in the UI; keep the optional remote embedding backend as a documented fallback.
4. **OCR for scanned PDFs and images.** Detect no-text pages, run OCR (Tesseract/OCRmyPDF or Docling OCR or a vision LLM, decided via ADR), keep page/offset mapping so citations still highlight; support PNG/JPG uploads; label OCR-derived text in the viewer.
5. **Live checks of optional features:** real Kokoro run (duration within 10% of target, under 6 minutes for a 30-page notebook, offline with Ollama), 20-minute captioned YouTube video from the deployment host (record whether transcript retrieval is blocked and whether the yt-dlp fallback works), 10-minute audio file transcribed on CPU in under 10 minutes.
6. **Server-side PDF export** on Linux (WeasyPrint with Pango in the Docker image) as an alternative to print-stylesheet PDF; keep print as fallback.
7. **Security re-test.** XSS tests for chat markdown, notes (Tiptap HTML), artifact viewer, share page and filenames (payload corpus, DOMPurify or equivalent allowlist, CSP verification); prompt-injection set against chat, summaries, artifacts and audio scripts; SSRF regression; upload fuzz (zip bombs, huge page counts, mismatched MIME).
8. **Settings wiring check:** persona and response-length settings must demonstrably change chat and artifact output.

## Agent Prompt
```
Read AGENTS.md, AGENTS_ADDENDUM.md and docs/levels/LEVEL_12_real_quality_and_reliability.md. Execute LEVEL 12 only.
Never report an eval number unless the real embedding model and a real chat model produced it; label everything else FAKE. Keep a held-out test split untouched during tuning. Use a different model family as judge. Record every experiment (variable, before, after) in docs/DECISIONS.md.
Work in passes with commits: (1) eval set + harness + baseline, (2) retrieval experiments, (3) dense-PDF speed + UI ETA, (4) OCR, (5) live Kokoro/YouTube/Whisper checks, (6) Linux PDF export, (7) XSS/injection/upload fuzz tests and fixes, (8) persona/length wiring.
Write .agents/LEVEL_12_REPORT.md with a results table and an explicit list of known weaknesses discovered.
Output <promise>L12_COMPLETE</promise> only when acceptance tests pass with measured evidence.
```

## Task checklist
- [ ] 12.1 Real document corpus + 60 questions + held-out split
- [ ] 12.2 Real-stack eval harness + baseline + nightly CI regression gate
- [ ] 12.3 Retrieval experiments logged
- [ ] 12.4 Dense-PDF speed work + UI ETA
- [ ] 12.5 OCR + image uploads + viewer labeling
- [ ] 12.6 Kokoro / YouTube / Whisper live checks
- [ ] 12.7 Linux server-side PDF export
- [ ] 12.8 XSS / injection / upload-fuzz suite and fixes
- [ ] 12.9 Persona and length wiring tests

## Acceptance tests
1. Baseline and final numbers on the held-out split: hit-rate@8 >= 0.85, citation validity 100%, citation precision >= 0.9, faithfulness >= 0.9, refusal accuracy on negatives >= 0.9. If targets are not met, the report states the real numbers and the plan.
2. A scanned 20-page PDF becomes searchable; clicking a citation highlights (or falls back to the page card) correctly.
3. Dense 100-page PDF ingestion time is recorded and the UI shows progress with ETA.
4. Real Kokoro overview of a 30-page notebook finishes in under 6 minutes, duration within 10% of target; works offline.
5. YouTube and audio results are recorded from the real deployment host, including failure modes.
6. All XSS payloads are inert in every renderer (automated); injection corpus does not change behavior; zip-bomb/oversize uploads are rejected safely.
7. Changing persona/length visibly changes chat and artifact output (automated with a recorded fixture).

## Working condition
"I trust the quality numbers because the real model produced them on documents I did not tune on, and scanned PDFs work."
