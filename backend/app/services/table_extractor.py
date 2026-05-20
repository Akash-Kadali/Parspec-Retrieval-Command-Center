"""Table extraction and row-atomic serialization for datasheet specs."""

from __future__ import annotations

import re
from typing import Any, Dict, List


def clean_cell(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def detect_headers(table: List[List[Any]]) -> tuple[List[str], List[List[Any]]]:
    if not table:
        return [], []
    first = [clean_cell(c) for c in table[0]]
    has_alpha = sum(bool(re.search(r"[A-Za-z]", c)) for c in first)
    has_numeric_heavy = sum(bool(re.fullmatch(r"[\d,./\-\s]+", c)) for c in first if c)
    if has_alpha >= max(1, len(first) // 2) and has_numeric_heavy < len(first) / 2:
        headers = first
        rows = table[1:]
    else:
        headers = [f"Col_{i}" for i in range(len(first))]
        rows = table
    clean_headers = []
    last = ""
    for i, h in enumerate(headers):
        h = clean_cell(h)
        if not h:
            h = last or f"Col_{i}"
        clean_headers.append(h)
        last = h
    return clean_headers, rows


def classify_table_section(headers: List[str], rows: List[List[Any]]) -> str:
    header_text = " ".join(headers).lower()
    value_text = " ".join(clean_cell(c) for row in rows[:5] for c in row).lower()
    text = f"{header_text} {value_text}"

    header_set = {h.lower() for h in headers}
    has_model = any(k in text for k in ["catalog", "model", "part number", "order", "series"])
    has_finish_matrix = (
        any("size" in h for h in header_set)
        and any("cct" in h or "kelvin" in h for h in header_set)
        and any("cri" in h for h in header_set)
        and any("trim" in h or "color" in h or "finish" in h for h in header_set)
    )

    if any(k in text for k in ["lumen", "efficacy", "lpw", "photometric", "candela"]):
        return "photometrics"
    if has_finish_matrix:
        return "ordering"
    if has_model and any(k in text for k in ["gpm", "cfm", "psi", "voltage", "watts", "lumens", "lpw"]):
        if any(k in text for k in ["lumens", "lpw", "efficacy", "watts"]):
            return "photometrics"
        return "ordering"
    if has_model or any(k in text for k in ["ordering", "suffix", "finish", "trim color"]):
        return "ordering"
    if any(k in text for k in ["ada", "cupc", "energy star", "dlc", "nsf", "cert"]):
        return "certifications"
    if any(k in text for k in ["dimension", "height", "width", "depth", "diameter", "cutout"]):
        return "dimensions"
    if any(k in text for k in ["voltage", "watts", "gpm", "cfm", "psi", "material"]):
        return "specs"
    return "general"


def serialize_table_rows(table: List[List[Any]], table_index: int = 0, source_page: int = 1) -> List[Dict[str, Any]]:
    headers, rows = detect_headers(table)
    if not headers:
        return []
    section_type = classify_table_section(headers, rows)
    serialized = []
    carry_forward = [""] * len(headers)
    for row_index, row in enumerate(rows):
        cells = [clean_cell(c) for c in row]
        if not any(cells):
            continue
        pairs = []
        normalized_row = []
        for idx, header in enumerate(headers):
            val = cells[idx] if idx < len(cells) else ""
            # pdfplumber often returns blank merged cells. Carry previous row context.
            if not val and idx < len(carry_forward):
                val = carry_forward[idx]
            elif val:
                carry_forward[idx] = val
            normalized_row.append(val)
            if val:
                pairs.append(f"{header}: {val}")
        if pairs:
            serialized.append({
                "text": " | ".join(pairs),
                "section_type": section_type,
                "table_index": table_index,
                "row_index": row_index,
                "table_headers": headers,
                "table_rows": [normalized_row],
                "source_page": source_page,
            })
    return serialized


def serialize_tables(tables: List[List[List[Any]]]) -> str:
    lines = []
    for ti, table in enumerate(tables):
        for row in serialize_table_rows(table, ti):
            lines.append(row["text"])
    return "\n".join(lines)


