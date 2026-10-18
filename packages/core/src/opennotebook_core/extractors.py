"""Turn supported inputs into one canonical text with addressable blocks."""

import re
from collections.abc import Sequence
from dataclasses import dataclass
from io import BytesIO
from typing import Protocol


@dataclass(frozen=True)
class Block:
    text: str
    char_start: int
    char_end: int
    page: int | None = None
    heading_path: tuple[str, ...] = ()


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


EXTRACTORS: dict[str, Extractor] = {
    "pdf": PdfExtractor(),
    "docx": DocxExtractor(),
    "pptx": PptxExtractor(),
    "txt": TextExtractor(),
    "md": MarkdownExtractor(),
    "text": TextExtractor(),
    "web": WebExtractor(),
}
