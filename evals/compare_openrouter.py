"""Run the same grounded golden set through two configured OpenRouter models."""

import asyncio
import json
import os
from datetime import UTC, datetime
from pathlib import Path

import httpx
from opennotebook_core.config import Settings
from opennotebook_core.llm import LiteLLMProvider

from evals.run import run_evals


async def main() -> None:
    base = Settings()
    configured = os.getenv("LEVEL10_OPENROUTER_MODELS", "")
    models = [value.strip() for value in configured.split(",") if value.strip()]
    if not models:
        models = list(dict.fromkeys([base.default_chat_model, base.default_cheap_model]))
    if len(models) < 2:
        raise SystemExit(
            "Set LEVEL10_OPENROUTER_MODELS to two comma-separated OpenRouter model IDs."
        )
    if not base.openrouter_api_key:
        raise SystemExit("OPENROUTER_API_KEY is required; key value is never printed.")

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {base.openrouter_api_key}"},
        )
        response.raise_for_status()
        catalog = {item["id"]: item for item in response.json().get("data", [])}

    results = []
    for model in models:
        if model not in catalog:
            raise SystemExit(f"Model ID is not present in the OpenRouter catalog: {model}")
        settings = base.model_copy(
            update={"llm_provider": "openrouter", "default_chat_model": model}
        )
        metrics = await run_evals(llm_provider=LiteLLMProvider(settings))
        pricing = catalog[model].get("pricing", {})
        input_price = float(pricing.get("prompt", 0))
        output_price = float(pricing.get("completion", 0))
        # Cost is an estimate from character-based token counts, not provider billing.
        input_tokens = output_tokens = 0
        cases = json.loads(Path(__file__).with_name("questions.json").read_text(encoding="utf-8"))
        # Use the fixed prompt/evidence workload approximation consistently across models.
        input_tokens = sum(900 + len(case["question"]) // 4 for case in cases)
        output_tokens = sum(70 for _ in cases)
        cost = input_tokens * input_price + output_tokens * output_price
        results.append(
            {
                "model": model,
                "questions": metrics.total,
                "hit_rate_at_8": metrics.hit_rate_at_8,
                "citation_validity": metrics.citation_validity,
                "faithfulness": metrics.faithfulness,
                "answer_relevance": metrics.answer_relevance,
                "estimated_cost_usd": round(cost, 6),
                "pricing_usd_per_token": {"input": input_price, "output": output_price},
                "cost_method": "OpenRouter catalog pricing x approximate token counts",
            }
        )
        print(json.dumps(results[-1], sort_keys=True))

    output = {
        "measured_at_utc": datetime.now(UTC).isoformat(),
        "source": "OpenRouter live calls; estimated cost, not billing data",
        "results": results,
    }
    destination = Path(__file__).parent / "results" / "openrouter-model-comparison.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
