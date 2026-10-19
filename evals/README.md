# Evals

The deterministic set contains 30 answerable fact questions over six checked-in
documents. Run `make eval` to report hit-rate@8, citation validity, lexical
faithfulness, and expected-fact answer relevance. The fake embedding and fake
LLM make this suitable for default CI; it tests pipeline behavior, not semantic
embedding quality.

Faithfulness counts an answer as supported when each answer sentence has at
least 75% content-word overlap with the cited retrieved passages. This lexical
proxy is intentionally deterministic and should not be read as a human judgment.

For a live model comparison, set `LEVEL10_OPENROUTER_MODELS` to two comma-separated
OpenRouter model IDs and run `uv run --frozen --all-packages python -m
evals.compare_openrouter`. It reads the local `OPENROUTER_API_KEY`, does not
print it, and records results under `evals/results/`. Costs are estimates from
the public model catalog and a fixed prompt workload approximation, not billing
usage. See ADR-012 in `docs/DECISIONS.md` for the latest run and tuning history.
