from io import BytesIO

from opennotebook_core.chunking import chunk_document
from opennotebook_core.extractors import ImageExtractor, PdfExtractor
from reportlab.pdfgen import canvas


def _scanned_pdf() -> bytes:
    from PIL import Image, ImageDraw, ImageFont
    from reportlab.lib.utils import ImageReader

    image = Image.new("RGB", (1800, 500), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=76)
    draw.text((60, 150), "SCANNED PAGE CITATION TEST 2026", fill="black", font=font)
    image_bytes = BytesIO()
    image.save(image_bytes, format="PNG")
    pdf_bytes = BytesIO()
    pdf = canvas.Canvas(pdf_bytes, pagesize=(900, 250))
    for _page in range(20):
        pdf.drawImage(ImageReader(BytesIO(image_bytes.getvalue())), 0, 0, width=900, height=250)
        pdf.showPage()
    pdf.save()
    return pdf_bytes.getvalue()


def test_scanned_pdf_ocr_keeps_page_and_marks_ocr_text() -> None:
    document = PdfExtractor().extract(_scanned_pdf())

    assert document.page_count == 20
    assert document.ocr_pages == tuple(range(1, 21))
    assert "SCANNED PAGE CITATION TEST 2026" in document.text
    assert document.blocks[0].page == 1
    assert document.blocks[0].heading_path == ("OCR text (page 1)",)
    chunk = chunk_document(document)[0]
    assert chunk.page_start == 1 and chunk.page_end == 20
    assert document.text[chunk.char_start : chunk.char_end] == chunk.text


def test_png_extractor_ocr_marks_image_text() -> None:
    from PIL import Image, ImageDraw, ImageFont

    image = Image.new("RGB", (1200, 300), "white")
    font = ImageFont.load_default(size=72)
    ImageDraw.Draw(image).text((30, 90), "OCR IMAGE CHECK", fill="black", font=font)
    encoded = BytesIO()
    image.save(encoded, format="PNG")

    document = ImageExtractor().extract(encoded.getvalue())

    assert document.ocr_pages == (1,)
    assert "OCR IMAGE CHECK" in document.text
