"""The checked-in evidence set must meet the Level 3 thresholds."""

import pytest

from evals.run import run_evals


@pytest.mark.asyncio
async def test_retrieval_hit_rate_and_citation_validity() -> None:
    metrics = await run_evals()
    assert metrics.total == 15
    assert metrics.hit_rate_at_8 >= 0.85
    assert metrics.citation_validity == 1.0
