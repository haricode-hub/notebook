"""Interactive artifact schema and learning behavior tests."""

import json
from collections.abc import AsyncIterator
from datetime import UTC
from typing import Any

import httpx
import pytest
from opennotebook_core.artifacts import (
    FakeArtifactLLM,
    Flashcard,
    FlashcardsArtifact,
    MindMapArtifact,
    MindMapNode,
    QuizArtifact,
    QuizQuestion,
    generate_artifact,
)
from opennotebook_core.models import Artifact, Chunk
from opennotebook_core.study import schedule_review, score_quiz
from pydantic import ValidationError
from test_level1 import auth
from test_level3_chat import seeded_book

pytest_plugins = ["test_level1"]


def chunk() -> Chunk:
    text = "Photosynthesis converts light into chemical energy in plants."
    return Chunk(
        id="chunk-1",
        source_id="source-1",
        notebook_id="book-1",
        ordinal=0,
        text=text,
        page_start=1,
        char_start=0,
        char_end=len(text),
        heading_path=[],
        embedding=[0.0] * 768,
        metadata_json={},
    )


def test_mind_map_validator_rejects_too_deep_or_large_tree() -> None:
    node = MindMapNode(label="leaf", summary="Grounded [S1]", source_refs=[1])
    for depth in range(4):
        node = MindMapNode(
            label=f"level {depth}", summary="Grounded [S1]", source_refs=[1], children=[node]
        )
    with pytest.raises(ValidationError, match="depth"):
        MindMapArtifact(title="Too deep", root=node)
    with pytest.raises(ValidationError, match="60 nodes"):
        MindMapArtifact(
            title="Too many",
            root=MindMapNode(
                label="root",
                summary="Root [S1]",
                source_refs=[1],
                children=[
                    MindMapNode(
                        label=f"branch {branch}",
                        summary="Branch [S1]",
                        source_refs=[1],
                        children=[
                            MindMapNode(label=str(index), summary="Fact [S1]", source_refs=[1])
                            for index in range(12)
                        ],
                    )
                    for branch in range(5)
                ],
            ),
        )


def test_quiz_requires_four_distinct_options_and_cited_explanation() -> None:
    common = dict(question="Which?", options=["A", "B", "C", "D"], answer_index=1, source_ref=1)
    with pytest.raises(ValidationError, match="distinct"):
        QuizQuestion.model_validate(
            {**common, "options": ["A", "A", "C", "D"], "explanation": "Because [S1]"}
        )
    with pytest.raises(ValidationError, match="cite"):
        QuizQuestion.model_validate({**common, "explanation": "Because."})
    with pytest.raises(ValidationError):
        QuizQuestion.model_validate({**common, "answer_index": 4, "explanation": "Because [S1]"})


class InvalidCitationLLM:
    def __init__(self) -> None:
        self.calls = 0

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        self.calls += 1
        if self.calls == 1:
            ref = 8
        else:
            ref = 99
        yield json.dumps(
            {
                "recipe": "flashcards",
                "title": "Cards",
                "cards": [{"front": "Q", "back": "A", "source_ref": ref}],
            }
        )


@pytest.mark.asyncio
async def test_interactive_recipes_generate_with_valid_citations() -> None:
    recipes: list[tuple[str, dict[str, object]]] = [
        ("mindmap", {}),
        ("flashcards", {}),
        ("quiz", {"question_count": 5}),
    ]
    for recipe, options in recipes:
        artifact, citations = await generate_artifact(
            recipe, [chunk()], {"source-1": "Science.txt"}, options, FakeArtifactLLM()
        )
        assert artifact.recipe == recipe
        assert citations[0]["chunk_id"] == "chunk-1"
        if recipe == "quiz":
            assert isinstance(artifact, QuizArtifact) and len(artifact.questions) == 5


@pytest.mark.asyncio
async def test_fabricated_interactive_source_ref_retries_then_fails() -> None:
    llm = InvalidCitationLLM()
    with pytest.raises(ValueError, match="after repair"):
        await generate_artifact("flashcards", [chunk()], {"source-1": "Science.txt"}, {}, llm)
    assert llm.calls == 2


def test_leitner_moves_known_forward_and_unknown_back_to_box_one() -> None:
    from datetime import datetime

    now = datetime(2026, 1, 1, tzinfo=UTC)
    box, due = schedule_review(1, True, now)
    assert box == 2 and (due - now).days == 1
    box, due = schedule_review(4, True, now)
    assert box == 5 and (due - now).days == 14
    box, due = schedule_review(5, False, now)
    assert box == 1 and due == now


def test_quiz_scoring_records_wrong_question_indexes() -> None:
    assert score_quiz([1, 0, 3, 2], [1, 2, 3, 0]) == (2, [1, 3])
    with pytest.raises(ValueError, match="count"):
        score_quiz([0], [])


def test_flashcard_schema_is_strict_and_bounded() -> None:
    with pytest.raises(ValidationError):
        Flashcard.model_validate({"front": "", "back": "Back", "source_ref": 1, "bonus": "no"})
    with pytest.raises(ValidationError):
        FlashcardsArtifact(
            title="Too many", cards=[Flashcard(front="Q", back="A", source_ref=1)] * 61
        )


@pytest.mark.asyncio
async def test_flashcard_progress_and_quiz_attempts_are_owned_and_persisted(
    level1_app: Any,
) -> None:
    app, keys, _, _ = level1_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        notebook_id = await seeded_book(app, client, keys, "study text")
        async with app.state.session_factory() as session:
            session.add_all(
                [
                    Artifact(
                        id="cards",
                        notebook_id=notebook_id,
                        user_id="owner",
                        recipe="flashcards",
                        status="ready",
                        stage="ready",
                        progress=100,
                        options_json={},
                        source_ids=["source"],
                        output_json={
                            "recipe": "flashcards",
                            "title": "Cards",
                            "cards": [{"front": "Q", "back": "A", "source_ref": 1}],
                        },
                        citations_json=[],
                        prompt_version="artifact-v1",
                    ),
                    Artifact(
                        id="quiz",
                        notebook_id=notebook_id,
                        user_id="owner",
                        recipe="quiz",
                        status="ready",
                        stage="ready",
                        progress=100,
                        options_json={},
                        source_ids=["source"],
                        output_json={
                            "recipe": "quiz",
                            "title": "Quiz",
                            "questions": [
                                {
                                    "question": "Q1",
                                    "options": ["a", "b", "c", "d"],
                                    "answer_index": 1,
                                    "explanation": "Because [S1]",
                                    "source_ref": 1,
                                },
                                {
                                    "question": "Q2",
                                    "options": ["a", "b", "c", "d"],
                                    "answer_index": 2,
                                    "explanation": "Evidence [S1]",
                                    "source_ref": 1,
                                },
                            ],
                        },
                        citations_json=[],
                        prompt_version="artifact-v1",
                    ),
                ]
            )
            await session.commit()
        owner, other = auth(keys.token("owner")), auth(keys.token("other"))
        base = f"/notebooks/{notebook_id}/artifacts"
        saved = await client.post(
            f"{base}/cards/flashcards/0/review", headers=owner, json={"known": True}
        )
        assert saved.status_code == 200 and saved.json()["box"] == 2
        assert (await client.get(f"{base}/cards/flashcards/progress", headers=owner)).json()[0][
            "box"
        ] == 2
        assert (
            await client.get(f"{base}/cards/flashcards/progress", headers=other)
        ).status_code == 404
        attempt = await client.post(
            f"{base}/quiz/quiz/attempts", headers=owner, json={"answers": [1, 0]}
        )
        assert attempt.status_code == 201
        assert attempt.json()["score"] == 1 and attempt.json()["wrong_indices"] == [1]
        assert len((await client.get(f"{base}/quiz/quiz/attempts", headers=owner)).json()) == 1
        assert (await client.get(f"{base}/quiz/quiz/attempts", headers=other)).status_code == 404
