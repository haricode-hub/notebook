"""Turn supported inputs into one canonical text with addressable blocks."""

import os
import re
import subprocess
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
    ocr_pages: tuple[int, ...] = ()


@dataclass(frozen=True)
class ExtractedFigure:
    data: bytes
    page: int
    text_anchor: str
    bbox: dict[str, float] | None = None
    mime_type: str = "image/png"


def extract_figures(kind: str, data: bytes) -> list[ExtractedFigure]:
    """Extract bounded image assets and human-readable anchors from PDFs/PPTX."""
    figures: list[ExtractedFigure] = []
    if kind == "pdf":
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(data), strict=False)
        for page_no, page in enumerate(reader.pages, 1):
            anchor = (page.extract_text() or "").strip()[:2000]
            for image in page.images:
                content = bytes(image.data)
                if content and len(content) <= 8 * 1024 * 1024:
                    suffix = os.path.splitext(str(image.name))[1].lower()
                    mime = "image/jpeg" if suffix in {".jpg", ".jpeg"} else "image/png"
                    figures.append(
                        ExtractedFigure(content, page_no, anchor or "Figure", mime_type=mime)
                    )
                if len(figures) >= 100:
                    return figures
    elif kind == "pptx":
        from pptx import Presentation
        from pptx.enum.shapes import MSO_SHAPE_TYPE

        deck = Presentation(BytesIO(data))
        for page_no, slide in enumerate(deck.slides, 1):
            text = " ".join(
                shape.text.strip()
                for shape in slide.shapes
                if shape.has_text_frame and shape.text.strip()
            )
            for shape in slide.shapes:
                if shape.shape_type != MSO_SHAPE_TYPE.PICTURE:
                    continue
                image = shape.image
                content = image.blob
                if not content or len(content) > 8 * 1024 * 1024:
                    continue
                bbox = {
                    "x": float(shape.left / deck.slide_width),
                    "y": float(shape.top / deck.slide_height),
                    "width": float(shape.width / deck.slide_width),
                    "height": float(shape.height / deck.slide_height),
                }
                mime = (
                    image.content_type if image.content_type.startswith("image/") else "image/png"
                )
                figures.append(
                    ExtractedFigure(content, page_no, text[:2000] or "Figure", bbox, mime)
                )
                if len(figures) >= 100:
                    return figures
    return figures


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
            parts: list[tuple[str, int | None, tuple[str, ...]]] = []
            ocr_pages: list[int] = []
            with tempfile.TemporaryDirectory(prefix="notebook-pdf-ocr-") as folder:
                input_path = os.path.join(folder, "source.pdf")
                with open(input_path, "wb") as pdf_file:
                    pdf_file.write(data)
                for number, page in enumerate(reader.pages, 1):
                    text = page.extract_text() or ""
                    if not text.strip():
                        text = _ocr_page(input_path, number, folder)
                        if text.strip():
                            ocr_pages.append(number)
                    heading = (f"OCR text (page {number})",) if number in ocr_pages else ()
                    parts.append((text, number, heading))
            document = _assemble(parts, len(reader.pages))
            return ExtractedDocument(
                document.text, document.blocks, document.page_count, tuple(ocr_pages)
            )
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(
                "Could not read this PDF. Check that it is not corrupt or password-protected"
            ) from exc


class ImageExtractor:
    def extract(self, data: bytes) -> ExtractedDocument:
        with tempfile.TemporaryDirectory(prefix="notebook-image-ocr-") as folder:
            if data.startswith(b"\x89PNG\r\n\x1a\n"):
                suffix = ".png"
            elif data.startswith(b"\xff\xd8\xff"):
                suffix = ".jpg"
            else:
                raise ValueError("Could not read this PNG or JPEG image")
            image_path = os.path.join(folder, f"source{suffix}")
            with open(image_path, "wb") as image_file:
                image_file.write(data)
            try:
                result = subprocess.run(
                    ["tesseract", image_path, "stdout", "-l", "eng", "--psm", "3"],
                    check=True,
                    capture_output=True,
                    timeout=60,
                )
            except FileNotFoundError as exc:
                raise ValueError("Image OCR needs Tesseract installed") from exc
            except subprocess.TimeoutExpired as exc:
                raise ValueError("OCR timed out on the uploaded image") from exc
            except subprocess.CalledProcessError as exc:
                raise ValueError("OCR failed on the uploaded image") from exc
            text = result.stdout.decode("utf-8", errors="replace").strip()
            if not text:
                raise ValueError("No readable text was found in this image")
            return ExtractedDocument(
                text, (Block(text, 0, len(text), 1, ("OCR text (page 1)",)),), 1, (1,)
            )


def _ocr_page(pdf_path: str, page: int, folder: str) -> str:
    """Run bounded local Tesseract OCR for a scanned PDF page."""
    prefix = os.path.join(folder, f"page-{page}")
    try:
        subprocess.run(
            [
                "pdftoppm",
                "-f",
                str(page),
                "-l",
                str(page),
                "-singlefile",
                "-r",
                "180",
                "-png",
                pdf_path,
                prefix,
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=30,
        )
        image_path = f"{prefix}.png"
        result = subprocess.run(
            ["tesseract", image_path, "stdout", "-l", "eng", "--psm", "3"],
            check=True,
            capture_output=True,
            timeout=30,
        )
        return result.stdout.decode("utf-8", errors="replace").strip()
    except FileNotFoundError as exc:
        raise ValueError("Scanned PDF needs Poppler (pdftoppm) and Tesseract installed") from exc
    except subprocess.TimeoutExpired as exc:
        raise ValueError(f"OCR timed out on PDF page {page}") from exc
    except subprocess.CalledProcessError as exc:
        raise ValueError(f"OCR failed on PDF page {page}") from exc


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
    "png": ImageExtractor(),
    "jpg": ImageExtractor(),
    "jpeg": ImageExtractor(),
    "docx": DocxExtractor(),
    "pptx": PptxExtractor(),
    "txt": TextExtractor(),
    "md": MarkdownExtractor(),
    "text": TextExtractor(),
    "web": WebExtractor(),
    "audio": AudioExtractor(),
}
