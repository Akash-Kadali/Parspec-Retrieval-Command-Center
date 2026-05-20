"""OCR service — extracts text from scanned/image-only PDFs.

Strategy:
  1. pdf2image + pytesseract (best quality, requires system packages)
  2. PyMuPDF pixmap + pytesseract (fallback if pdf2image unavailable)
  3. PyMuPDF built-in text extraction as last-ditch fallback
  4. Clear error message if nothing works — never crashes the pipeline

Required system packages for full OCR:
  - poppler-utils  (for pdf2image)
  - tesseract-ocr  (for pytesseract)
Install with:
  apt-get install -y poppler-utils tesseract-ocr
"""

import logging
from typing import List, Tuple

logger = logging.getLogger(__name__)

# Probe for pdf2image + pytesseract at import time
_tesseract_available = False
_pdf2image_available = False

try:
    import pytesseract  # noqa: F401
    _tesseract_available = True
except ImportError:
    pass

try:
    from pdf2image import convert_from_path  # noqa: F401
    _pdf2image_available = True
except ImportError:
    pass


def ocr_available() -> bool:
    """Return True if full OCR pipeline (pdf2image + pytesseract) is usable."""
    return _tesseract_available and _pdf2image_available


def extract_text_with_ocr(pdf_path: str) -> Tuple[List[str], str]:
    """Extract text from a scanned PDF, returning per-page text.

    Returns (page_texts, method) where page_texts is a list of strings
    (one per page) and method describes which engine succeeded.
    """
    # Strategy 1: pdf2image → pytesseract (per-page)
    if _pdf2image_available and _tesseract_available:
        try:
            pages = _tesseract_ocr_pages(pdf_path)
            if any(p.strip() for p in pages):
                return pages, "pytesseract"
        except Exception as e:
            logger.warning(f"pytesseract OCR failed for {pdf_path}: {e}")

    # Strategy 2: PyMuPDF pixmap → pytesseract (per-page, no poppler needed)
    if _tesseract_available:
        try:
            pages = _pymupdf_pixmap_ocr(pdf_path)
            if any(p.strip() for p in pages):
                return pages, "pymupdf_pixmap_ocr"
        except Exception as e:
            logger.warning(f"PyMuPDF pixmap OCR failed for {pdf_path}: {e}")

    # Strategy 3: PyMuPDF text extraction (for "scanned" PDFs with hidden text layer)
    try:
        pages = _pymupdf_text_fallback(pdf_path)
        if any(p.strip() for p in pages):
            return pages, "pymupdf_hidden_text"
    except Exception as e:
        logger.warning(f"PyMuPDF fallback failed for {pdf_path}: {e}")

    # Strategy 4: Return clear error — don't crash
    missing = []
    if not _pdf2image_available:
        missing.append("pdf2image (pip install pdf2image) + poppler-utils")
    if not _tesseract_available:
        missing.append("pytesseract (pip install pytesseract) + tesseract-ocr")

    error_msg = (
        "[OCR unavailable] This PDF appears to be scanned/image-only but OCR "
        "dependencies are not installed. Install: " + "; ".join(missing)
    )
    logger.warning(error_msg)
    return [error_msg], "ocr_unavailable"


def _tesseract_ocr_pages(pdf_path: str) -> List[str]:
    """Use pdf2image + pytesseract for high-quality per-page OCR."""
    from pdf2image import convert_from_path
    import pytesseract

    images = convert_from_path(pdf_path, dpi=300)
    page_texts = []
    for img in images:
        text = pytesseract.image_to_string(img, lang="eng")
        page_texts.append(text.strip() if text else "")
    return page_texts


def _pymupdf_pixmap_ocr(pdf_path: str) -> List[str]:
    """Use PyMuPDF rasterization + pytesseract (no poppler needed)."""
    import fitz
    import pytesseract
    from PIL import Image
    import io

    doc = fitz.open(pdf_path)
    page_texts = []
    for page in doc:
        pix = page.get_pixmap(dpi=300)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        text = pytesseract.image_to_string(img, lang="eng")
        page_texts.append(text.strip() if text else "")
    return page_texts


def _pymupdf_text_fallback(pdf_path: str) -> List[str]:
    """Fallback: try PyMuPDF's built-in text extraction per page."""
    import fitz
    doc = fitz.open(pdf_path)
    page_texts = []
    for page in doc:
        text = page.get_text("text")
        page_texts.append(text.strip() if text else "")
    return page_texts