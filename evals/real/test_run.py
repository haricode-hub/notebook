"""Guard tests for the real evaluation harness; these tests make no model calls."""

import json

import pytest
from run import DOCS, ROOT, Passage, family, load_embedder, rrf_rank, split_text


def test_corpus_and_splits_are_fixed_and_disjoint() -> None:
    manifest = json.loads((DOCS / "manifest.json").read_text(encoding="utf-8"))
    dev = json.loads((ROOT / "questions_dev.json").read_text(encoding="utf-8"))
    heldout = json.loads((ROOT / "questions_heldout.json").read_text(encoding="utf-8"))
    source_ids = {row["id"] for row in manifest}
    assert len(manifest) == 12
    assert len(dev) + len(heldout) >= 60
    assert len({row["id"] for row in dev}) == len(dev)
    assert not ({row["id"] for row in dev} & {row["id"] for row in heldout})
    assert any(row["negative"] for row in dev + heldout)
    assert any(len(row["source_ids"]) > 1 for row in dev + heldout)
    assert {source for row in dev + heldout for source in row["source_ids"]} <= source_ids
    assert any("attacker@gmail.com" in row["expected_fact"] for row in dev)
    assert any("56 percent" in row["expected_fact"] for row in heldout)


def test_corpus_hashes_match_downloaded_documents() -> None:
    import hashlib

    manifest = json.loads((DOCS / "manifest.json").read_text(encoding="utf-8"))
    for item in manifest:
        contents = (DOCS / item["filename"]).read_bytes()
        assert hashlib.sha256(contents).hexdigest() == item["sha256"]


def test_dev_chunks_are_bounded_and_overlap_without_losing_text() -> None:
    text = " ".join(f"Sentence number {number} has a clear endpoint." for number in range(120))
    chunks = split_text(text, max_chars=500, overlap_chars=80)
    assert len(chunks) > 2
    assert all(chunk.rstrip().endswith(".") for chunk in chunks)
    assert all(
        set(left.split(". ")) & set(right.split(". "))
        for left, right in zip(chunks, chunks[1:], strict=False)
    )


def test_fake_embedding_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMBED_BACKEND", "fake")
    with pytest.raises(RuntimeError, match="forbidden"):
        load_embedder()


@pytest.mark.parametrize(
    ("model", "expected"),
    [("google/gemini-3.1-flash-lite", "google"), ("anthropic/claude-sonnet-4", "anthropic")],
)
def test_model_family_resolution(model: str, expected: str) -> None:
    assert family(model) == expected


def test_rrf_fuses_rankings_without_comparing_scores() -> None:
    first = Passage("p1", "doc-a", "alpha content", [])
    second = Passage("p2", "doc-b", "beta content", [])
    third = Passage("p3", "doc-c", "gamma content", [])
    fused = rrf_rank([first, second], [second, third])
    assert fused[0] is second
    assert {passage.passage_id for passage in fused} == {"p1", "p2", "p3"}
