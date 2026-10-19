"""Reusable source-grounded artifact recipe registry and generator."""

import asyncio
import json
import re
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from io import BytesIO
from typing import Literal, Protocol, cast

from docx import Document
from pydantic import BaseModel, ConfigDict, Field, model_validator

from opennotebook_core.audio import AudioOverview
from opennotebook_core.models import Chunk
from opennotebook_core.prompts.artifact_v2 import RECIPES, artifact_messages, map_messages
from opennotebook_core.prompts.chat_v1 import MARKER, Citation


class ArtifactSection(BaseModel):
    heading: str = Field(min_length=1, max_length=200)
    markdown: str = Field(min_length=1)
    citation_refs: list[int] = Field(min_length=1)


class ArtifactDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    recipe: str
    title: str = Field(min_length=1, max_length=200)
    sections: list[ArtifactSection] = Field(min_length=1)


class MindMapNode(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    label: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=1000)
    source_refs: list[int] = Field(min_length=1, max_length=10)
    children: list["MindMapNode"] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def valid_source_refs(self) -> "MindMapNode":
        if any(ref < 1 for ref in self.source_refs) or len(set(self.source_refs)) != len(
            self.source_refs
        ):
            raise ValueError("Mind map source_refs must be distinct positive citation numbers")
        return self


class MindMapArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    recipe: Literal["mindmap"] = "mindmap"
    title: str = Field(min_length=1, max_length=200)
    root: MindMapNode

    @model_validator(mode="after")
    def bounded_tree(self) -> "MindMapArtifact":
        count = 0

        def walk(node: MindMapNode, depth: int) -> None:
            nonlocal count
            count += 1
            if depth > 4:
                raise ValueError("Mind map depth must be at most 4")
            if count > 60:
                raise ValueError("Mind map must contain at most 60 nodes")
            for child in node.children:
                walk(child, depth + 1)

        walk(self.root, 1)
        return self


class Flashcard(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    front: str = Field(min_length=1, max_length=500)
    back: str = Field(min_length=1, max_length=1500)
    source_ref: int = Field(gt=0)


class FlashcardsArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    recipe: Literal["flashcards"] = "flashcards"
    title: str = Field(min_length=1, max_length=200)
    cards: list[Flashcard] = Field(min_length=1, max_length=60)


class QuizQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    question: str = Field(min_length=1, max_length=800)
    options: list[str] = Field(min_length=4, max_length=4)
    answer_index: int = Field(ge=0, le=3)
    explanation: str = Field(min_length=1, max_length=1500)
    source_ref: int = Field(gt=0)

    @model_validator(mode="after")
    def distinct_options_and_cited_explanation(self) -> "QuizQuestion":
        if len({option.strip().casefold() for option in self.options}) != 4:
            raise ValueError("Quiz options must be distinct")
        refs = {int(match.group(1)) for match in MARKER.finditer(self.explanation)}
        if refs != {self.source_ref}:
            raise ValueError("Quiz explanation must cite its source_ref")
        return self


class QuizArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    recipe: Literal["quiz"] = "quiz"
    title: str = Field(min_length=1, max_length=200)
    questions: list[QuizQuestion] = Field(min_length=1, max_length=50)


class EvidenceItem(BaseModel):
    ref: int
    fact: str = Field(min_length=1, max_length=800)


class EvidenceDigest(BaseModel):
    items: list[EvidenceItem] = Field(min_length=1, max_length=3)


@dataclass(frozen=True)
class ArtifactRecipe:
    id: str
    title: str
    instruction: str
    renderer_id: str = "markdown_sections_v1"
    output_schema: type[BaseModel] = ArtifactDocument


RECIPES_REGISTRY: dict[str, ArtifactRecipe] = {
    key: ArtifactRecipe(key, title, instruction) for key, (title, instruction) in RECIPES.items()
}
RECIPES_REGISTRY["audio_overview"] = ArtifactRecipe(
    "audio_overview",
    "Audio overview",
    "Create a grounded two-host conversation.",
    "audio_player_v1",
    AudioOverview,
)
for _id, _schema, _title, _renderer in (
    ("mindmap", MindMapArtifact, "Mind map", "mindmap_v1"),
    ("flashcards", FlashcardsArtifact, "Flashcards", "flashcards_v1"),
    ("quiz", QuizArtifact, "Quiz", "quiz_v1"),
):
    RECIPES_REGISTRY[_id] = ArtifactRecipe(
        _id,
        _title,
        RECIPES[_id][1],
        _renderer,
        _schema,
    )

GeneratedArtifact = (
    ArtifactDocument | MindMapArtifact | FlashcardsArtifact | QuizArtifact | AudioOverview
)


class ArtifactLLM(Protocol):
    def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]: ...


async def _collect(llm: ArtifactLLM, messages: list[dict[str, str]]) -> str:
    return "".join([piece async for piece in llm.stream(messages)])


async def _validated_call[T: BaseModel](
    llm: ArtifactLLM,
    messages: list[dict[str, str]],
    schema: type[T],
    validate: Callable[[T], None],
) -> T:
    raw = await _collect(llm, messages)
    for attempt in range(2):
        try:
            cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.I)
            value = schema.model_validate_json(cleaned)
            validate(value)
            return value
        except ValueError as exc:
            if attempt:
                raise ValueError(
                    "Artifact model returned invalid or ungrounded JSON after repair"
                ) from exc
            messages = [
                *messages,
                {"role": "assistant", "content": raw[:12000]},
                {
                    "role": "user",
                    "content": (
                        "Repair the JSON to match the schema and citation rules. "
                        f"Error: {str(exc)[:1000]}. Return JSON only."
                    ),
                },
            ]
            raw = await _collect(llm, messages)
    raise AssertionError("unreachable")


def _batches(excerpts: list[dict[str, object]], max_bytes: int) -> list[list[dict[str, object]]]:
    batches: list[list[dict[str, object]]] = []
    batch: list[dict[str, object]] = []
    for excerpt in excerpts:
        item = dict(excerpt)
        # A single very large chunk still has a strict request budget.
        item["text"] = str(item["text"])[: max_bytes // 2]
        if batch and len(json.dumps([*batch, item], ensure_ascii=False).encode()) > max_bytes:
            batches.append(batch)
            batch = []
        batch.append(item)
    if batch:
        batches.append(batch)
    return batches


def _validate_document(document: ArtifactDocument, recipe: str, allowed: set[int]) -> None:
    if document.recipe != recipe:
        raise ValueError("Wrong recipe in artifact output")
    for section in document.sections:
        markers = {int(match.group(1)) for match in MARKER.finditer(section.markdown)}
        if not markers or markers != set(section.citation_refs) or not markers <= allowed:
            raise ValueError("Artifact section contains missing or fabricated citations")


def _validate_output(
    document: BaseModel, recipe: str, allowed: set[int], options: dict[str, object]
) -> None:
    if getattr(document, "recipe", None) != recipe:
        raise ValueError("Wrong recipe in artifact output")
    if isinstance(document, ArtifactDocument):
        _validate_document(document, recipe, allowed)
        return
    refs: set[int] = set()
    if isinstance(document, MindMapArtifact):

        def walk(node: MindMapNode) -> None:
            refs.update(node.source_refs)
            for child in node.children:
                walk(child)

        walk(document.root)
    elif isinstance(document, FlashcardsArtifact):
        refs.update(card.source_ref for card in document.cards)
    elif isinstance(document, QuizArtifact):
        raw_count = options.get("question_count", 10)
        if not isinstance(raw_count, int):
            raise ValueError("Quiz question count must be an integer")
        requested = raw_count
        if len(document.questions) != requested:
            raise ValueError("Quiz question count must match the requested count")
        refs.update(question.source_ref for question in document.questions)
    if not refs or not refs <= allowed:
        raise ValueError("Artifact contains missing or fabricated citations")


async def generate_artifact(
    recipe: str,
    chunks: list[Chunk],
    source_names: dict[str, str],
    options: dict[str, object],
    llm: ArtifactLLM,
    *,
    max_input_bytes: int = 10000,
    progress: Callable[[str, int], Awaitable[None]] | None = None,
) -> tuple[GeneratedArtifact, list[Citation]]:
    """Map long sources into cited evidence, then generate a validated document."""
    if recipe not in RECIPES_REGISTRY:
        raise ValueError("Unknown artifact recipe")
    if not chunks:
        raise ValueError("Select at least one ready source with indexed text")
    labeled = {n: chunk for n, chunk in enumerate(chunks, 1)}
    excerpts: list[dict[str, object]] = [
        {
            "ref": n,
            "source": source_names.get(chunk.source_id, "Source"),
            "page": chunk.page_start,
            "text": chunk.text,
        }
        for n, chunk in labeled.items()
    ]
    batches = _batches(excerpts, max_input_bytes)
    if len(batches) > 1:
        semaphore = asyncio.Semaphore(4)

        async def map_batch(
            batch: list[dict[str, object]], reducing: bool = False
        ) -> EvidenceDigest:
            allowed = {int(str(item["ref"])) for item in batch}

            def validate(digest: EvidenceDigest) -> None:
                if any(item.ref not in allowed for item in digest.items):
                    raise ValueError("Evidence map invented a citation")

            async with semaphore:
                return await _validated_call(
                    llm, map_messages(batch, reducing=reducing), EvidenceDigest, validate
                )

        digests = await asyncio.gather(*(map_batch(batch) for batch in batches))
        items = [item.model_dump() for digest in digests for item in digest.items]
        if progress:
            await progress("reducing", 65)
        for _ in range(10):
            if len(json.dumps(items, ensure_ascii=False).encode()) <= max_input_bytes:
                break
            reduction_input: list[dict[str, object]] = [
                {"ref": item["ref"], "text": str(item["fact"])[:400]} for item in items
            ]
            groups = _batches(reduction_input, max_input_bytes)
            if len(groups) >= len(items):
                raise ValueError("Evidence could not fit within the model input budget")
            reduced = await asyncio.gather(*(map_batch(group, True) for group in groups))
            items = [item.model_dump() for digest in reduced for item in digest.items]
        else:
            raise ValueError("Evidence reduction exceeded the input budget")
        evidence: object = items
    else:
        evidence = excerpts
    document = await _validated_call(
        llm,
        artifact_messages(recipe, evidence, options),
        RECIPES_REGISTRY[recipe].output_schema,
        lambda value: _validate_output(value, recipe, set(labeled), options),
    )
    used: set[int] = set()
    if isinstance(document, ArtifactDocument):
        used.update(ref for section in document.sections for ref in section.citation_refs)
    elif isinstance(document, MindMapArtifact):

        def collect(node: MindMapNode) -> None:
            used.update(node.source_refs)
            for child in node.children:
                collect(child)

        collect(document.root)
    elif isinstance(document, FlashcardsArtifact):
        used.update(card.source_ref for card in document.cards)
    elif isinstance(document, QuizArtifact):
        used.update(question.source_ref for question in document.questions)
    used_refs = sorted(used)
    citations: list[Citation] = [
        {
            "n": number,
            "chunk_id": labeled[number].id,
            "source_id": labeled[number].source_id,
            "page_start": labeled[number].page_start,
            "time_start": labeled[number].time_start,
            "time_end": labeled[number].time_end,
            "char_start": labeled[number].char_start,
            "char_end": labeled[number].char_end,
            "source_name": source_names.get(labeled[number].source_id, "Source"),
            "quote": labeled[number].text[:500],
        }
        for number in used_refs
    ]
    return cast(GeneratedArtifact, document), citations


class FakeArtifactLLM:
    """Deterministic local artifact model for tests and offline development."""

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        data = json.loads(messages[1]["content"])
        if data["task"] in {"evidence_map", "evidence_reduce"}:
            yield EvidenceDigest(
                items=[
                    EvidenceItem(ref=item["ref"], fact=str(item["text"])[:200])
                    for item in data["excerpts"][:3]
                ]
            ).model_dump_json()
            return
        evidence = data["evidence"]
        first = evidence[0]
        ref = first["ref"]
        fact = str(first.get("fact") or first.get("text") or "Source finding").splitlines()[0][:250]
        artifact_cls = RECIPES_REGISTRY[data["recipe"]].output_schema
        if artifact_cls is MindMapArtifact:
            yield MindMapArtifact(
                title="Mind map",
                root=MindMapNode(
                    label="Key finding", summary=f"{fact} [S{ref}]", source_refs=[ref], children=[]
                ),
            ).model_dump_json()
            return
        if artifact_cls is FlashcardsArtifact:
            yield FlashcardsArtifact(
                title="Flashcards",
                cards=[
                    Flashcard(
                        front="What is the key finding?", back=f"{fact} [S{ref}]", source_ref=ref
                    )
                ],
            ).model_dump_json()
            return
        if artifact_cls is QuizArtifact:
            yield QuizArtifact(
                title="Quiz",
                questions=[
                    QuizQuestion(
                        question=f"Which statement is supported by the source? ({index + 1})",
                        options=[fact, "Not stated", "Opposite of the source", "None of these"],
                        answer_index=0,
                        explanation=f"The source supports this. [S{ref}]",
                        source_ref=ref,
                    )
                    for index in range(int(data.get("question_count") or 10))
                ],
            ).model_dump_json()
            return
        yield ArtifactDocument(
            recipe=data["recipe"],
            title=data["title"],
            sections=[
                ArtifactSection(
                    heading="Key finding", markdown=f"{fact} [S{ref}]", citation_refs=[ref]
                )
            ],
        ).model_dump_json()


def markdown_export(document: ArtifactDocument, citations: list[Citation]) -> str:
    lines = [f"# {document.title}", ""]
    for section in document.sections:
        lines.extend([f"## {section.heading}", "", section.markdown, ""])
    lines.extend(["## Sources", ""])
    for citation in citations:
        lines.append(
            f"[S{citation['n']}] {citation['source_name']}"
            + (f", page {citation['page_start']}" if citation["page_start"] else "")
        )
    return "\n".join(lines) + "\n"


def docx_export(document: ArtifactDocument, citations: list[Citation]) -> bytes:
    output = Document()
    output.add_heading(document.title, 0)
    for section in document.sections:
        output.add_heading(section.heading, level=1)
        output.add_paragraph(section.markdown)
    output.add_heading("Sources", level=1)
    for citation in citations:
        output.add_paragraph(
            f"[S{citation['n']}] {citation['source_name']}"
            + (f", page {citation['page_start']}" if citation["page_start"] else "")
        )
    buffer = BytesIO()
    output.save(buffer)
    return buffer.getvalue()
