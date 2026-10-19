"""Pure, offset-preserving sentence chunking."""

import re
from dataclasses import dataclass

from opennotebook_core.extractors import ExtractedDocument

_SENTENCE_END = re.compile(r"[.!?](?:[\"'’”)}\]]*)\s+|\n\s*\n+|\Z")
_ABBREVIATIONS = {"dr.", "mr.", "mrs.", "ms.", "prof.", "inc.", "e.g.", "i.e.", "vs."}


def _token_estimate(value: str) -> int:
    return max(1, (len(value.split()) * 13 + 9) // 10)


@dataclass(frozen=True)
class ChunkSpan:
    text: str
    char_start: int
    char_end: int
    page_start: int | None
    page_end: int | None
    heading_path: tuple[str, ...]
    time_start: float | None = None
    time_end: float | None = None


def _sentences(text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    start = 0
    for match in _SENTENCE_END.finditer(text):
        prefix = text[start : match.start() + 1].rstrip().lower()
        last = prefix.rsplit(" ", 1)[-1]
        if last in _ABBREVIATIONS:
            continue
        end = match.end()
        if text[start:end].strip():
            spans.append((start, end))
        start = end
    if start < len(text) and text[start:].strip():
        spans.append((start, len(text)))
    return spans


def chunk_document(
    document: ExtractedDocument, target_tokens: int = 650, overlap: float = 0.12
) -> list[ChunkSpan]:
    if target_tokens < 1 or not 0 <= overlap < 1:
        raise ValueError("invalid chunking parameters")
    sentences = _sentences(document.text)
    if not sentences:
        return []
    spans: list[ChunkSpan] = []
    start_index = 0
    while start_index < len(sentences):
        end_index = start_index
        tokens = 0
        while end_index < len(sentences):
            next_tokens = _token_estimate(
                document.text[sentences[end_index][0] : sentences[end_index][1]]
            )
            if end_index > start_index and tokens + next_tokens > target_tokens:
                break
            tokens += next_tokens
            end_index += 1
        start = sentences[start_index][0]
        end = sentences[end_index - 1][1]
        while start < end and document.text[start].isspace():
            start += 1
        while end > start and document.text[end - 1].isspace():
            end -= 1
        touched = [
            block for block in document.blocks if block.char_start < end and block.char_end > start
        ]
        pages = [block.page for block in touched if block.page is not None]
        spans.append(
            ChunkSpan(
                document.text[start:end],
                start,
                end,
                min(pages) if pages else None,
                max(pages) if pages else None,
                touched[0].heading_path if touched else (),
                min(
                    (block.time_start for block in touched if block.time_start is not None),
                    default=None,
                ),
                max(
                    (block.time_end for block in touched if block.time_end is not None),
                    default=None,
                ),
            )
        )
        if end_index == len(sentences):
            break
        overlap_tokens = max(1, int(tokens * overlap))
        back = 0
        new_start = end_index
        while new_start > start_index + 1 and back < overlap_tokens:
            new_start -= 1
            back += _token_estimate(
                document.text[sentences[new_start][0] : sentences[new_start][1]]
            )
        start_index = new_start
    return spans
