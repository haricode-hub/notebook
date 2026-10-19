from types import SimpleNamespace
from typing import Any

import pytest

from evals.real import run as real_eval


@pytest.mark.asyncio
async def test_judge_repairs_invalid_json_once(monkeypatch: pytest.MonkeyPatch) -> None:
    responses = iter(["I think yes.", '{"faithful": true}'])
    calls: list[dict[str, Any]] = []

    async def completion(**kwargs: Any) -> Any:
        calls.append(kwargs)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=next(responses)))]
        )

    monkeypatch.setattr(real_eval.litellm, "acompletion", completion)
    result = await real_eval.judge("openrouter/deepseek/deepseek-v4-flash-0731", [], "key")

    assert result == {"faithful": True}
    assert len(calls) == 2
    assert "Repair your previous response" in calls[1]["messages"][-1]["content"]
