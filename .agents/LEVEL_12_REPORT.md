# Level 12: Real Quality and Reliability

Status: **INCOMPLETE — acceptance gates remain open.** Level 11 is also incomplete. No held-out questions were run. Only results produced by the real EmbeddingGemma 2 encoder and real OpenRouter answer model are reported as eval numbers. Fake tests are explicitly labeled.

## Results

| Gate | Command / evidence | Measured value | Result | Runner |
|---|---|---:|---|---|
| Real corpus and split | `evals/real/docs/manifest.json`, `questions_dev.json`, `questions_heldout.json` | 12 public documents; 792 PDF pages; 48 dev + 12 held-out questions; 746 passages | Implemented; corpus has known coverage gaps below | Windows CPU |
| Held-out isolation | eval commands used only `--split dev`; no held-out command issued | 12 questions untouched | Pass for isolation; final quality acceptance not measured | Windows workspace |
| Real dev baseline, Sonnet judge | `evals/real/run.py --split dev` (hybrid, RRF k=60) | hit@8 45/45 (100%); MRR .9526; citation validity 47/48 (97.92%); precision 43/44 (97.73%); faithfulness 47/48 (97.92%); relevance 47/48; negative refusal 3/3 | Real dev result; fails 100% citation validity; not held-out acceptance | Windows CPU + Gemma2 FP32 + Gemini 3.1 Flash Lite + Claude Sonnet 4.5 judge |
| Real dev judge comparison, DeepSeek | `evals/real/run.py --split dev`, result `evals/real/results/dev_20261019T170903Z.json` | hit@8 45/45; MRR .9526; citation validity 47/48; precision 33/44 (75%); faithfulness 33/48 (68.75%); relevance 33/48 (68.75%); refusal 0/3 | Complete raw run; judge failed the criterion on all three exact refusals, so quality metrics are uncalibrated and not accepted | Windows CPU + Gemma2 FP32 + Gemini 3.1 Flash Lite + DeepSeek V4 Flash judge |
| Retrieval tuning | dev-only strict citation instruction, then hybrid RRF k=60 | strict syntax improved validity 83.33%→97.92%; hybrid improved hit@8 97.78%→100%, MRR .9315→.9526 (Sonnet judge) | Better dev configuration retained; held-out untouched | Windows CPU + real models |
| Cheap judge cost | OpenRouter published DeepSeek list prices: $0.03/M input, $0.13/M output; official page linked in ADR | Actual token use and invoice amount not captured | Price comparison only; no measured run cost | OpenRouter catalog + local run |
| Dense 100-page PDF | `python evals/real/benchmark_pdf.py` | 100 pages; extraction 7.53s; chunk 0.05s; 82 chunks embedded in 335.56s (0.24 chunks/s); post-load total 343.14s; RSS 1,924.4 MiB | Measured with real Gemma2 FP32; DB indexing excluded; slow CPU embedding is a known issue | Windows CPU |
| ETA | `pytest tests/test_level12_eta.py`; web TypeScript check | ETA arithmetic test passed; SSE includes `eta_seconds`; Sources UI displays it | Code and unit checks pass; browser timing/visual verification not run | Windows |
| OCR scanned PDF + image | `pytest tests/test_level12_ocr.py` | Synthetic scanned 20-page PDF searchable; OCR pages 1–20 and offsets verified; PNG OCR passed | Local tests pass; Linux container/viewer browser check pending | Windows + Poppler + Tesseract |
| Live Kokoro / YouTube / Whisper | deployment-host checks | No completed measurements | **BLOCKED**: the user interrupted the live Kokoro attempt; no deployment target measurements for 20-minute YouTube or 10-minute Whisper were completed. Do not retry Kokoro without new instruction. | No accepted runner |
| Server PDF export | `pytest tests/test_level12_pdf_export.py tests/test_level6.py` | API route tests: 11 passed; real WeasyPrint PDF test skipped on Windows | **BLOCKED** for Linux rendering proof. Python 3.13 dependency and Linux image/CI native libraries are added, but no Linux workflow output exists. | Windows; Linux gate not run |
| Security regressions | cited/shared Markdown Vitest; Level 2/3/8 Python tests | Markdown XSS tests 3 passed; upload oversize/mismatched signatures/201 MiB ZIP expansion rejection passed; existing prompt-injection, SSRF, and audio faithfulness tests passed | Partial local unit/component coverage; editor/browser/CSP and broad fuzz gate open | Windows |
| Persona / response length | `tests/test_level12_settings_wiring.py` | 3 FakeLLM tests pass: settings alter chat prompt and reach artifact prompt/worker | **FAKE** wiring evidence only; no real generated-output comparison | Windows, FakeLLM |
| Final local regression | `.venv/Scripts/python -m pytest -q --basetemp <writable temp>`; Ruff; mypy; Web lint/typecheck/Vitest | Python 120 passed, 2 skipped; Ruff clean; mypy 44 files clean; ESLint 0 errors/3 warnings; TypeScript clean; Vitest 9 passed | Local gates pass; no Playwright, Docker, or Linux workflow run | Windows |
| Target acceptance thresholds | Real eval report above | DeepSeek judged faithfulness 68.75%, precision 75%, refusal 0%; Sonnet judged citation validity 97.92% | **FAIL / NOT ACCEPTED**; baseline misses 100% citation validity, and DeepSeek is demonstrably inconsistent. Need calibrate a distinct-family judge before final held-out run. | Real dev models |

The real evaluation outputs and embeddings are ignored local artifacts under `evals/real/results/`; they are not committed. DeepSeek is the current default judge at the user's request. Historical Sonnet metrics retain their actual judge attribution. A malformed DeepSeek JSON response halted the first run after 11 questions; the runner now checkpoints completed rows and retries one malformed judge response once. The resumed run completed 48/48.

## Pass log

1. **Eval set, harness, baseline:** Added 12-source corpus manifest and disjoint 48/12 question splits. Real Gemma2 FP32 and OpenRouter answer model baseline completed on dev. The nightly workflow and cached passage embeddings are implemented. Held-out remains untouched.
2. **Retrieval experiments:** Changed one variable per experiment on dev only. Strict citation syntax improved citation validity. Hybrid RRF k=60 improved retrieval and Sonnet-judged scores. Cheap judge comparison is recorded above; it produced inconsistent labels and cannot replace the prior calibrated result.
3. **Dense PDF + ETA:** Recorded a real 100-page CPU benchmark and added batched worker progress with ETA. Throughput is 0.24 chunks/s on this host; no optimization comparison has been run.
4. **OCR:** Added English Tesseract OCR for textless PDF pages and PNG/JPEG, with page and character anchors. Generated 20-page scan plus PNG tests pass locally.
5. **Live optional services:** Not complete. Live Kokoro was interrupted by the user and remains paused. YouTube transcript/deployment fallback and real CPU Whisper benchmarks are absent.
6. **Linux PDF:** Added locked WeasyPrint 70, route/UI path, and Linux-native packages in Docker/CI. Windows route tests pass; real PDF output test is skipped on this Windows runner. Linux proof is open.
7. **Security:** Added tests for shared/chat/artifact Markdown escaping and upload expansion bombs. Existing tests cover chat injection, audio faithfulness filtering, SSRF and share revocation. Full editor/share browser payload matrix, CSP browser verification, and broad upload fuzzing remain open.
8. **Persona/length:** The worker now forwards persisted preferences to artifact prompts; chat and artifact prompts receive them. Three FakeLLM tests verify request wiring only; actual output difference remains unmeasured.

## Known weaknesses discovered

- The Level 11 prerequisite remains incomplete, including CI Playwright e2e and several Docker/scale/VPS runtime gates.
- The 60-question held-out split has not been run; no held-out score is claimed.
- Current real dev baseline citation validity is below the required 100%.
- DeepSeek V4 Flash, though cheap, marked all three exact canonical refusals wrong and gave substantially lower precision/faithfulness/relevance than Sonnet. Judge quality needs calibration; do not interpret those differences as a change in Gemini answer quality.
- Published token prices are not actual run costs; token usage/invoice data was not retained.
- Corpus includes historical NIST SP 800-61 Rev. 2 (withdrawn/superseded), no dedicated scanned source, and limited standalone web-article coverage. The scanned test is synthetic.
- CPU embedding dominates the measured 100-page PDF time. Benchmark excludes database insertion/indexing and does not compare batch sizes, ONNX, quantization, truncation, or remote fallback.
- OCR is English-only and its 500-page worst-case runtime is unmeasured. Docker/Linux OCR and citation-viewer browser behavior are unverified.
- Live Kokoro, YouTube, and Whisper acceptance checks have no measured outcomes. Kokoro remains paused after user interruption.
- WeasyPrint's real Linux PDF output and deployment-container startup are not measured.
- XSS tests do not cover a full browser payload matrix in Tiptap, public share page, or deployed CSP; zip-bomb coverage is one bounded regression case, not fuzzing.
- Persona/length tests use FakeLLM prompt inspection; real model output changes have not been demonstrated.
- Final local Python, Ruff, mypy, Web lint, typecheck, and Vitest commands passed as listed in the results table. Playwright Level 12 e2e, Docker clean startup, and Linux CI were not run.

## Commits

- Pass 4 OCR: `ef51582`
- Pass 6 PDF implementation: `ef663c2`; Linux output test: `db2df72`
- Pass 7 security: `49db183`
- Pass 8 settings wiring: `a193872`
- Eval judge JSON retry: `14887f7`

The Level 12 task is **not complete** and no `<promise>L12_COMPLETE</promise>` is issued because measured acceptance gates remain open.
