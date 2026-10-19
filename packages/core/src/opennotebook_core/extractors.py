"""Turn supported inputs into one canonical text with addressable blocks."""

import os
import re
import tempfile
from collections.abc import Sequence
from dataclasses import dataclass
from io import BytesIO
from typing import Protocol
from urllib.parse import parse_qs, urlsplit


@dataclass(frozen=True)
class Block:
    text: str
    char_start: int
    char_end: int
    page: int | None = None
    heading_path: tuple[str, ...] = ()
    time_start: float | None = None
    time_end: float | None = None


@dataclass(frozen=True)
class ExtractedDocument:
    text: str
    blocks: tuple[Block, ...]
    page_count: int | None = None


class Extractor(Protocol):
    def extract(self, data: bytes) -> ExtractedDocument: ...


def _assemble(
    parts: Sequence[tuple[str, int | None, tuple[str, ...]]], page_count: int | None = None
) -> ExtractedDocument:
    text = ""
    blocks: list[Block] = []
    for value, page, headings in parts:
        value = value.strip()
        if not value:
            continue
        if text:
            text += "\n\n"
        start = len(text)
        text += value
        blocks.append(Block(value, start, len(text), page, headings))
    if not blocks:
        raise ValueError("No readable text was found in this source")
    return ExtractedDocument(text, tuple(blocks), page_count)


class TextExtractor:
    def extract(self, data: bytes) -> ExtractedDocument:
        try:
            value = data.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError("Text source must be UTF-8") from exc
        if not value.strip():
            raise ValueError("No readable text was found in this source")
        return ExtractedDocument(value, (Block(value, 0, len(value)),))


class MarkdownExtractor:
    def extract(self, data: bytes) -> ExtractedDocument:
        try:
            value = data.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError("Markdown source must be UTF-8") from exc
        headings: list[str] = []
        parts: list[tuple[str, int | None, tuple[str, ...]]] = []
        paragraph: list[str] = []

        def flush() -> None:
            if paragraph:
                parts.append(("\n".join(paragraph), None, tuple(headings)))
                paragraph.clear()

        for line in value.splitlines():
            heading = re.match(r"^(#{1,6})\s+(.+)$", line)
            if heading:
                flush()
                level = len(heading.group(1))
                headings = headings[: level - 1] + [heading.group(2).strip()]
                parts.append((heading.group(2), None, tuple(headings)))
            elif not line.strip():
                flush()
            else:
                paragraph.append(line)
        flush()
        return _assemble(parts)


class PdfExtractor:
    def extract(self, data: bytes) -> ExtractedDocument:
        from pypdf import PdfReader

        try:
            reader = PdfReader(BytesIO(data), strict=False)
            if len(reader.pages) > 500:
                raise ValueError("PDF exceeds the 500-page limit")
            parts = [
                (page.extract_text() or "", number, ())
                for number, page in enumerate(reader.pages, 1)
            ]
            return _assemble(parts, len(reader.pages))
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(
                "Could not read this PDF. Check that it is not corrupt or password-protected"
            ) from exc


class DocxExtractor:
    def extract(self, data: bytes) -> ExtractedDocument:
        from docx import Document

        try:
            document = Document(BytesIO(data))
            headings: list[str] = []
            parts: list[tuple[str, int | None, tuple[str, ...]]] = []
            for paragraph in document.paragraphs:
                value = paragraph.text.strip()
                if not value:
                    continue
                if paragraph.style and paragraph.style.name.lower().startswith("heading"):
                    level = int("".join(filter(str.isdigit, paragraph.style.name)) or "1")
                    headings = headings[: level - 1] + [value]
                parts.append((value, None, tuple(headings)))
            for table in document.tables:
                for row in table.rows:
                    parts.append(
                        (" | ".join(cell.text for cell in row.cells), None, tuple(headings))
                    )
            return _assemble(parts)
        except Exception as exc:
            raise ValueError("Could not read this DOCX file") from exc


class PptxExtractor:
    def extract(self, data: bytes) -> ExtractedDocument:
        from pptx import Presentation

        try:
            deck = Presentation(BytesIO(data))
            if len(deck.slides) > 500:
                raise ValueError("Presentation exceeds the 500-slide limit")
            parts: list[tuple[str, int | None, tuple[str, ...]]] = []
            for number, slide in enumerate(deck.slides, 1):
                title = slide.shapes.title.text.strip() if slide.shapes.title else ""
                for shape in slide.shapes:
                    if shape.has_text_frame and shape.text.strip():
                        parts.append((shape.text, number, (title,) if title else ()))
            return _assemble(parts, len(deck.slides))
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError("Could not read this PPTX file") from exc


class WebExtractor:
    def extract(self, data: bytes) -> ExtractedDocument:
        import trafilatura
        from bs4 import BeautifulSoup

        try:
            html = data.decode("utf-8", errors="replace")
            value = trafilatura.extract(html, include_comments=False, include_tables=True)
            if not value:
                soup = BeautifulSoup(html, "html.parser")
                for unwanted in soup(["script", "style", "nav", "footer", "header"]):
                    unwanted.decompose()
                value = soup.get_text("\n", strip=True)
            if not value:
                raise ValueError("No readable article text was found at this URL")
            return _assemble([(value, None, ())])
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError("Could not extract readable text from this website") from exc


def _timestamped_document(parts: Sequence[tuple[str, float, float]]) -> ExtractedDocument:
    text = ""
    blocks: list[Block] = []
    for value, start_time, end_time in parts:
        value = value.strip()
        if not value:
            continue
        if text:
            text += "\n\n"
        start = len(text)
        text += value
        blocks.append(Block(value, start, len(text), time_start=start_time, time_end=end_time))
    if not blocks:
        raise ValueError("No speech was detected in this media source")
    return ExtractedDocument(text, tuple(blocks))


def parse_youtube_id(url: str) -> str:
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower().rstrip(".")
    if host not in {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}:
        raise ValueError("Only youtube.com and youtu.be links are supported")
    try:
        if parsed.scheme != "https" or parsed.port not in {None, 443} or parsed.username:
            raise ValueError("YouTube URL must use HTTPS")
    except ValueError as exc:
        raise ValueError("YouTube URL has an invalid port") from exc
    if host == "youtu.be":
        video_id = parsed.path.strip("/").split("/")[0]
    else:
        video_id = parse_qs(parsed.query).get("v", [""])[0]
        if not video_id and parsed.path.startswith("/shorts/"):
            video_id = parsed.path.split("/")[2]
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ValueError("YouTube URL does not contain a valid video ID")
    return video_id


def extract_youtube_transcript(url: str, languages: Sequence[str] = ("en",)) -> ExtractedDocument:
    from youtube_transcript_api import YouTubeTranscriptApi

    transcript = YouTubeTranscriptApi().fetch(parse_youtube_id(url), languages=list(languages))
    return _timestamped_document(
        [
            (str(row.text), float(row.start), float(row.start + row.duration))
            for row in transcript.snippets
        ]
    )


class AudioExtractor:
    """Timestamped speech extraction; Whisper is lazily initialized on first use."""

    _model: object | None = None

    @classmethod
    def _whisper(cls) -> object:
        if cls._model is None:
            from faster_whisper import WhisperModel  # type: ignore[import-untyped]

            cls._model = WhisperModel("small", device="cpu", compute_type="int8")
        return cls._model

    def extract(self, data: bytes, suffix: str = ".mp3") -> ExtractedDocument:
        if not data:
            raise ValueError("Audio file is empty")
        if suffix.lower() not in {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".opus", ".webm"}:
            suffix = ".mp3"
        with tempfile.NamedTemporaryFile(suffix=suffix.lower(), delete=False) as audio_file:
            audio_path = audio_file.name
            audio_file.write(data)
        try:
            model = self._whisper()
            segments, _info = model.transcribe(  # type: ignore[attr-defined]
                audio_path, beam_size=5, vad_filter=True
            )
            parts: list[tuple[str, float, float]] = []
            for segment in segments:
                value = str(segment.text).strip()
                if value:
                    parts.append((value, float(segment.start), float(segment.end)))
        finally:
            os.unlink(audio_path)
        return _timestamped_document(parts)


EXTRACTORS: dict[str, Extractor] = {
    "pdf": PdfExtractor(),
    "docx": DocxExtractor(),
    "pptx": PptxExtractor(),
    "txt": TextExtractor(),
    "md": MarkdownExtractor(),
    "text": TextExtractor(),
    "web": WebExtractor(),
    "audio": AudioExtractor(),
}
