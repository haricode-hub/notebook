"""Fail the nightly held-out job when measured real-stack thresholds regress."""

import json
import sys
from pathlib import Path


def main(path: Path) -> int:
    result = json.loads(path.read_text(encoding="utf-8"))
    if result.get("split") != "heldout":
        raise ValueError("nightly regression checks must use the heldout split")
    if result.get("embedding_backend") != "real_sentence_transformers_fp32":
        raise ValueError("nightly regression checks require real EmbeddingGemma")
    if result.get("answer_model", "").startswith("fake"):
        raise ValueError("nightly regression checks require a real chat model")
    thresholds = {
        "hit_rate_at_8": 0.85,
        "citation_validity": 1.0,
        "citation_precision": 0.9,
        "faithfulness": 0.9,
        "negative_refusal_accuracy": 0.9,
    }
    failures = []
    for metric, minimum in thresholds.items():
        measured = result.get(metric)
        if not isinstance(measured, (int, float)) or measured < minimum:
            failures.append(f"{metric}: {measured!r} < {minimum:.2f}")
    for metric, minimum in thresholds.items():
        print(f"{metric}={result.get(metric)!r} target>={minimum:.2f}")
    if failures:
        print("FAIL: " + "; ".join(failures))
        return 1
    print("PASS: all held-out real-stack regression thresholds met")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(Path(sys.argv[1])))
