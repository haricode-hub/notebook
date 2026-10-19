"""The checked-in evidence set must meet the Level 3 thresholds."""

import pytest

from evals.run import run_evals


@pytest.mark.asyncio
async def test_retrieval_citation_and_faithfulness_targets() -> None:
    metrics = await run_evals()
    assert metrics.total >= 30
    assert metrics.hit_rate_at_8 >= 0.9
    assert metrics.citation_validity == 1.0
    assert metrics.faithfulness >= 0.9
