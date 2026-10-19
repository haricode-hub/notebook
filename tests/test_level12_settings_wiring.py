import json

import pytest
from opennotebook_core.artifacts import generate_artifact
from opennotebook_core.prompts.artifact_v2 import artifact_messages
from opennotebook_core.prompts.chat_v1 import build_chat_messages
from opennotebook_core.retrieval import ContextSelection
from test_level3_retrieval import _chunk
from test_level6 import ScriptedLLM, fixture_document, sample_chunk


def test_chat_persona_and_response_length_change_system_instructions() -> None:
    selection = ContextSelection([_chunk(1)], {"source": "Evidence"}, "full", "question")
    concise = build_chat_messages(
        selection, "question", [], persona="patient tutor", response_length="short"
    )
    detailed = build_chat_messages(
        selection, "question", [], persona="skeptical professor", response_length="long"
    )

    assert concise[0]["content"] != detailed[0]["content"]
    assert "patient tutor" in concise[0]["content"]
    assert "short" in concise[0]["content"]
    assert "skeptical professor" in detailed[0]["content"]
    assert "long" in detailed[0]["content"]


def test_artifact_prompt_includes_notebook_persona_and_length() -> None:
    user = json.loads(
        artifact_messages(
            "study_guide", [], {"persona": "patient tutor", "response_length": "long"}
        )[1]["content"]
    )

    assert user["assistant_persona"] == "patient tutor"
    assert user["response_length_preference"] == "long"


@pytest.mark.asyncio
async def test_generated_artifact_receives_persona_and_length_settings() -> None:
    llm = ScriptedLLM([fixture_document("study_guide")])
    await generate_artifact(
        "study_guide",
        [sample_chunk()],
        {"evidence": "Launch.txt"},
        {"persona": "patient tutor", "response_length": "long"},
        llm,
    )
    request = json.loads(llm.calls[0][-1]["content"])

    assert request["assistant_persona"] == "patient tutor"
    assert request["response_length_preference"] == "long"
