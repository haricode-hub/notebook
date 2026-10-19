# Real-stack RAG evaluation

`docs/manifest.json` contains ten public government documents with source URLs, rights notes, byte sizes, and SHA-256 checksums. The fixed question set has 48 development questions and 12 held-out questions. It includes single-source, multi-source, negative, and risk-oriented questions. Keep `questions_heldout.json` out of all retrieval tuning and prompt iteration; run it only for the final measurement or scheduled regression workflow.

The real runner is intentionally separate from `evals/run.py`. It requires `EMBED_BACKEND=gemma2`, loads `google/embeddinggemma-2` with vision/audio disabled and FP32 weights, sends answers through a real OpenRouter chat model, and obtains grounding/citation judgments from an explicitly configured different model family. It refuses fake backends and refuses a same-family judge. It writes detailed JSON under `results/`; results are local artifacts and are not committed by default.

Configure `OPENROUTER_API_KEY`, `EVAL_CHAT_MODEL`, and `EVAL_JUDGE_MODEL` in the environment. Use a judge family that differs from the answer family. Example for a Google answer model: choose an Anthropic judge model. Model IDs should be selected from the current OpenRouter catalog and kept in environment/CI variables.

Run a development baseline or experiment:

```powershell
$env:EMBED_BACKEND = "gemma2"
$env:EVAL_CHAT_MODEL = "<configured OpenRouter answer model>"
$env:EVAL_JUDGE_MODEL = "<configured different-family judge model>"
uv run --frozen --all-packages python evals/real/run.py --split dev
```

For a workstation with the official checkpoint already cached, set `HF_HUB_OFFLINE=1` to prevent model downloads. The scheduled workflow evaluates only `heldout`, applies the Level 12 thresholds, and uploads the measured result as a workflow artifact. It requires the `OPENROUTER_API_KEY` secret and `EVAL_CHAT_MODEL` / `EVAL_JUDGE_MODEL` repository variables.

Metrics are valid Level 12 evidence only when the result records the real EmbeddingGemma model, a real answer model, and a different-family judge. Existing synthetic or fake evaluation values must be labeled **FAKE**.
