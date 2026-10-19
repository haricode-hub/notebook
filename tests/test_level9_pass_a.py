from types import SimpleNamespace

import pytest
from opennotebook_core.chunking import chunk_document
from opennotebook_core.discovery import DuckDuckGoSearch
from opennotebook_core.extractors import (
    AudioExtractor,
    extract_youtube_transcript,
    parse_youtube_id,
)


def test_parse_only_supported_youtube_urls() -> None:
    assert parse_youtube_id("https://youtu.be/abcdefghijk?t=10") == "abcdefghijk"
    assert parse_youtube_id("https://www.youtube.com/watch?v=abcdefghijk") == "abcdefghijk"
    with pytest.raises(ValueError):
        parse_youtube_id("https://youtube.com.attacker.example/watch?v=abcdefghijk")
    with pytest.raises(ValueError):
        parse_youtube_id("http://youtube.com/watch?v=abcdefghijk")


def test_youtube_transcript_fixture(monkeypatch: pytest.MonkeyPatch) -> None:
    import youtube_transcript_api

    calls: list[tuple[str, list[str]]] = []

    class FakeTranscriptAPI:
        def fetch(self, video_id: str, languages: list[str]) -> object:
            calls.append((video_id, languages))
            return SimpleNamespace(
                snippets=[
                    SimpleNamespace(text="The first fact.", start=12.0, duration=2.0),
                    SimpleNamespace(text="The next fact.", start=14.0, duration=3.0),
                ]
            )

    monkeypatch.setattr(youtube_transcript_api, "YouTubeTranscriptApi", FakeTranscriptAPI)
    document = extract_youtube_transcript("https://youtube.com/watch?v=abcdefghijk")
    assert calls == [("abcdefghijk", ["en"])]
    assert len(document.blocks) == 2
    assert document.blocks[0].time_start == 12.0
    assert document.blocks[1].time_end == 17.0
    chunk = chunk_document(document, target_tokens=8)[0]
    assert chunk.time_start == 12.0
    assert chunk.time_end is not None and chunk.time_end >= 14.0


def test_audio_whisper_segments_are_timestamped(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeModel:
        def transcribe(self, path: str, **kwargs: object) -> tuple[list[object], object]:
            assert kwargs["beam_size"] == 5
            assert kwargs["vad_filter"] is True
            with open(path, "rb") as audio_file:
                assert audio_file.read() == b"fixture-audio"
            return [
                SimpleNamespace(text="A spoken fact.", start=1.25, end=2.75),
                SimpleNamespace(text="Another fact.", start=2.8, end=4.0),
            ], SimpleNamespace(duration=4.0)

    monkeypatch.setattr(AudioExtractor, "_model", FakeModel())
    document = AudioExtractor().extract(b"fixture-audio", ".wav")
    spans = chunk_document(document)
    assert spans[0].time_start == 1.25
    assert spans[0].time_end == 4.0


@pytest.mark.asyncio
async def test_discovery_filters_private_and_redirect_urls(monkeypatch: pytest.MonkeyPatch) -> None:
    import opennotebook_core.discovery as discovery

    async def fixture_fetch(url: str, **kwargs: object) -> bytes:
        return b"""
        <div class="result"><a class="result__a" href="https://example.org/research">Good source</a>
        <a class="result__snippet">A useful snippet</a></div>
        <div class="result"><a class="result__a" href="http://127.0.0.1/private">Private</a></div>
        """

    monkeypatch.setattr(discovery, "fetch_public_url", fixture_fetch)
    results = await DuckDuckGoSearch().search("photosynthesis research", limit=5)
    assert [(item.title, item.url) for item in results] == [
        ("Good source", "https://example.org/research")
    ]
