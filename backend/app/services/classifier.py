"""PDF type classifier — routes each PDF to the right extraction strategy.

Returns (pdf_type, confidence, diagnostics) where pdf_type is one of:
  - "scanned": image-only, needs OCR
  - "multi_col": native text but multi-column layout, needs column-aware extraction
  - "native": standard extractable PDF
"""

import logging
from typing import Tuple, Dict, Any, List

import fitz

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


def cluster_x_positions(positions: List[float], tolerance: int = 30) -> List[List[float]]:
    """Group x-coordinates into clusters to detect column layout."""
    if not positions:
        return []
    sorted_pos = sorted(positions)
    clusters: List[List[float]] = [[sorted_pos[0]]]
    for pos in sorted_pos[1:]:
        if pos - clusters[-1][-1] < tolerance:
            clusters[-1].append(pos)
        else:
            clusters.append([pos])
    return clusters


def classify_pdf(pdf_path: str) -> Tuple[str, float, Dict[str, Any]]:
    """Classify a PDF and return (type, confidence, diagnostics)."""
    doc = fitz.open(pdf_path)
    total_chars = 0
    page_chars = []

    for page in doc:
        text = page.get_text("text") or ""
        char_count = len(text.strip())
        total_chars += char_count
        page_chars.append(char_count)

    total_pages = len(doc)
    chars_per_page = total_chars / max(total_pages, 1)

    diagnostics: Dict[str, Any] = {
        "total_chars": total_chars,
        "chars_per_page": round(chars_per_page, 1),
        "total_pages": total_pages,
        "page_chars": page_chars,
    }

    # Stage 1: Scanned detection
    if chars_per_page < settings.ocr_chars_threshold:
        diagnostics["reason"] = (
            f"chars_per_page={chars_per_page:.0f} < threshold={settings.ocr_chars_threshold}"
        )
        return "scanned", 0.95, diagnostics

    # Stage 2: Multi-column detection
    multi_col_pages = 0
    for page in doc:
        blocks = page.get_text("blocks")
        if not blocks:
            continue
        text_blocks = [b for b in blocks if b[-1] == 0 and b[4].strip()]
        if not text_blocks:
            continue
        x_positions = [b[0] for b in text_blocks]
        x_clusters = cluster_x_positions(x_positions, tolerance=settings.multi_col_tolerance)
        if len(x_clusters) >= 2:
            cluster_sizes = [len(c) for c in x_clusters]
            if min(cluster_sizes) >= 3:
                multi_col_pages += 1

    multi_col_ratio = multi_col_pages / max(total_pages, 1)
    diagnostics["multi_col_pages"] = multi_col_pages
    diagnostics["multi_col_ratio"] = round(multi_col_ratio, 2)

    if multi_col_ratio > 0.5:
        diagnostics["reason"] = f"multi_col_ratio={multi_col_ratio:.2f} > 0.5"
        return "multi_col", multi_col_ratio, diagnostics

    # Stage 3: Count tables
    try:
        import pdfplumber
        table_count = 0
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables() or []
                table_count += len(tables)
        diagnostics["detected_tables"] = table_count
    except Exception:
        diagnostics["detected_tables"] = "error"

    diagnostics["reason"] = "standard native text PDF"
    return "native", 0.90, diagnostics
