import sys
from io import BytesIO

import pytest
from opennotebook_core.artifacts import ArtifactDocument, ArtifactSection, pdf_export
from pypdf import PdfReader

pytestmark = pytest.mark.skipif(
    sys.platform == "win32", reason="WeasyPrint system libraries are Linux-only in the API image"
)


def test_weasyprint_server_export_is_a_readable_pdf() -> None:
    document = ArtifactDocument(
        recipe="briefing",
        title="Safe <title>",
        sections=[
            ArtifactSection(
                heading="Finding",
                markdown="The source supports **this claim** [S1].\n\n<script>alert(1)</script>",
                citation_refs=[1],
            )
        ],
    )
    citations = [
        {
            "n": 1,
            "chunk_id": "chunk",
            "source_id": "source",
            "page_start": 4,
            "time_start": None,
            "time_end": None,
            "char_start": 0,
            "char_end": 20,
            "source_name": "Research source",
            "quote": "This claim.",
        }
    ]

    data = pdf_export(document, citations)
    reader = PdfReader(BytesIO(data))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)

    assert data.startswith(b"%PDF-")
    assert len(reader.pages) == 1
    assert "Safe <title>" in text
    assert "Research source, page 4" in text
    assert "alert(1)" in text
