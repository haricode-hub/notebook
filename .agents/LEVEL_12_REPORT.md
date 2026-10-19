# Level 12: Real Quality and Reliability

Status: **IN PROGRESS**. The Level 11 prerequisite is not complete: task 11.2 and later runtime gates remain unchecked in `.agents/TASKS.md`. Work is proceeding because the user explicitly requested Level 12. No Level 11 or Level 12 acceptance gate is inferred from earlier level notes.

`AGENTS_ADDENDUM.md` was not present at the repository root when checked. The provided Level 12 spec and the status/gap analysis were read.

## Results

| Gate | Command / evidence | Measured value | Status | Runner |
|---|---|---:|---|---|
| Real corpus + question set | `evals/real/docs/manifest.json`, `questions_dev.json`, `questions_heldout.json` | 12 public documents; 792 PDF pages; 48 dev + 12 held-out questions | Implemented; source content validation pending | Windows workspace |
| Held-out isolation | `evals/real/test_run.py` | Separate files; harness requires explicit `--split`; no tuning has run | In progress | Windows workspace |
| Real dev baseline (dense, initial citation prompt) | `evals/real/run.py --split dev` | 44/45 positive hit@8; MRR 0.9315; citation validity 40/48 (83.33%); citation precision 36/37 (97.30%); faithfulness 45/48 (93.75%); negative refusal 3/3 | Measured; dev only | Windows CPU + live OpenRouter |
| Dense + strict citation format | real harness, dev split | hit@8 44/45 (97.78%); MRR 0.9315; validity 47/48 (97.92%); precision 21/22 (95.45%); faithfulness 46/48 (95.83%); relevance 47/48; refusal 3/3 | Measured; held-out untouched | Windows CPU + Gemini 3.1 Flash Lite + Anthropic Sonnet 4.5 judge |
| Hybrid RRF k=60 + strict citation format | `EVAL_RETRIEVAL_MODE=hybrid EVAL_TOP_K=8 python evals/real/run.py --split dev` | hit@8 45/45 (100%); MRR 0.9526; validity 47/48 (97.92%); precision 43/44 (97.73%); faithfulness 47/48 (97.92%); relevance 47/48; refusal 3/3 | Measured; held-out untouched | Windows CPU + Gemini 3.1 Flash Lite + Anthropic Sonnet 4.5 judge |
| Level 11 prerequisite | `.agents/TASKS.md` | Task 11.2 and runtime gates unchecked | Open | Repository state |

The development baseline completed with real EmbeddingGemma 2 vectors, a live Google chat model, and a live Anthropic judge. This is a development result only; it is not the held-out acceptance result. Existing offline/fake evaluation results are not Level 12 evidence.

## Known weaknesses discovered

- Level 11 CI e2e and multiple earlier runtime acceptance gates remain open, including Level 0 cold-build timing, Level 9 Pass C, and Level 10 scale/VPS checks.
- The local `.env` selects the fake embedding backend. A real-model evaluation must explicitly select the Gemma backend and load the official checkpoint; the new runner rejects fake mode.
- `anthropic/claude-sonnet-4` returned OpenRouter 404 (“No endpoints found”); this produced no score. The official OpenRouter catalog lists `anthropic/claude-sonnet-4.5`, which is the current separate-family judge candidate for the retry.
- The corpus now includes PDF and HTML publications, a NASA slide deck, a NIST webinar transcript, a numeric lakes assessment, and an authentic prompt-injection paper. It still lacks a scanned PDF and a separate web article source.
- The corpus includes historical NIST SP 800-61 Rev. 2; its own cover marks it withdrawn and superseded by Rev. 3. Questions against it are version-specific, but it is not current incident-response guidance.
- The current app PDF extractor has no OCR fallback; scanned-page citation mapping remains unverified.
- Live OpenRouter, Kokoro, YouTube, Whisper, Linux PDF export, and upload-security measurements have not run in this pass.

## Pass log

### Pass 1 — eval set, harness, baseline

- Added a source manifest with URLs, rights notes, sizes, and SHA-256 checksums for 12 sources, including six NIST PDFs, NIST HTML, EPA/NASA reports, a transcript, slides, and the instruction-hierarchy injection paper.
- Added 60 questions in disjoint development and held-out files (48/12). Development includes multi-source, negative, transcript, and injection-content questions; held-out includes unseen numeric/tabular questions. Tuning is restricted to development data; held-out results will be run once after tuning.
- Added a real-stack harness with real text-only FP32 EmbeddingGemma 2, a real OpenRouter answer model, and an explicit different-family judge. It refuses fake mode and writes full per-question results.
- Development baseline completed with 746 passages, real text-only FP32 EmbeddingGemma 2, `google/gemini-3.1-flash-lite`, and different-family `anthropic/claude-sonnet-4.5` judge. Question SHA-256: `62af05cfece3cef78e88175c972c10ed9e7d849767780dbe153d4a04afbb51ba`; corpus manifest SHA-256: `e063e2bc5d7c9a24c048ec4a696f09294058343aff8849a4b62e76d9e8e0331c`. Detailed per-question output is in the ignored local file `evals/real/results/dev_20261019T160655Z.json`.
- The main baseline defect was citation syntax: the model combined markers as `[S1, S2]`, which the production citation parser cannot validate. The completed dev-only experiment changed only the prompt's citation-format instruction; held-out remains unused.
- Dev experiment 1 changed only that citation-format instruction. Citation validity improved from 40/48 (83.33%) to 47/48 (97.92%) and faithfulness from 45/48 (93.75%) to 46/48 (95.83%); hit-rate and relevance were unchanged. Citation precision moved from 36/37 (97.30%) to 21/22 (95.45%), still above 90%. The remaining invalid case is d54: dense retrieval missed the prompt-injection paper excerpt and the model correctly refused. See the full before/after log in `docs/DECISIONS.md`.


### Pass 2 ? retrieval experiments

- Experiment 1 changed only citation format guidance. It improved validity and faithfulness; see `docs/DECISIONS.md` for before/after measurements.
- Experiment 2 changed only retrieval mode from dense to hybrid reciprocal-rank fusion (k=60). All 48 development questions completed with real EmbeddingGemma 2 FP32, Google Gemini 3.1 Flash Lite answer generation, and Anthropic Claude Sonnet 4.5 judging. Compared with dense + strict citation format: hit-rate@8 rose 97.78% to 100%, MRR 0.9315 to 0.9526, citation precision 95.45% to 97.73%, faithfulness 95.83% to 97.92%; validity and relevance were unchanged. Kept hybrid for this config. Run artifact: `evals/real/results/dev_20261019T163307Z.json` (local ignored output).
- The initial hybrid attempt stopped after 15 questions with OpenRouter HTTP 402 because LiteLLM requested up to 64,000 output tokens. It produced no metrics. The runner now caps answers at 1,024 tokens and judge JSON at 512 and checkpoints completed rows under a config hash. The successful capped rerun is the only hybrid result reported above.
- The 12-question held-out file has not been evaluated or used for tuning. No held-out score is claimed.
