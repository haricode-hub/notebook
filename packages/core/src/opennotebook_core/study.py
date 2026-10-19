"""Deterministic study scheduling and quiz scoring helpers."""

from datetime import UTC, datetime, timedelta

LEITNER_INTERVAL_DAYS = {1: 0, 2: 1, 3: 3, 4: 7, 5: 14}


def schedule_review(box: int, known: bool, now: datetime | None = None) -> tuple[int, datetime]:
    """Advance known cards; reset forgotten cards. Box one is immediately due."""
    if not 1 <= box <= 5:
        raise ValueError("Leitner box must be between 1 and 5")
    next_box = min(5, box + 1) if known else 1
    base = now or datetime.now(UTC)
    due = base + timedelta(days=LEITNER_INTERVAL_DAYS[next_box])
    return next_box, due


def score_quiz(answer_key: list[int], answers: list[int]) -> tuple[int, list[int]]:
    if len(answer_key) != len(answers):
        raise ValueError("Answer count does not match quiz length")
    wrong = [
        index
        for index, (expected, actual) in enumerate(zip(answer_key, answers, strict=True))
        if expected != actual
    ]
    return len(answer_key) - len(wrong), wrong
