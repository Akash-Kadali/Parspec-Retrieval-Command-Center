"""Query understanding — classify queries and explain matches.

Classifies each query into one of:
  - spec_heavy: numeric specs present (CFM, GPM, lumens, watts, CCT, size, etc.)
  - rough_description: descriptive words only, no numeric specs or model numbers
  - model_number: contains a detected model number pattern
  - comparable_product: model_number + comparable/similar/alternative keywords
"""

import re
from typing import Dict, Any, List

from backend.app.services.spec_extractor import (
    extract_numeric_specs,
    extract_model_numbers,
)

# ---------------------------------------------------------------------------
# Comparable-product detection
# ---------------------------------------------------------------------------

_COMPARABLE_KEYWORDS = re.compile(
    r"\b(?:comparable|similar|alternative|equivalent|competing|competitor|like\s+the|like\s+this|find\s+(?:comparable|similar|alternative))\b",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Query classification
# ---------------------------------------------------------------------------

def classify_query(query: str) -> str:
    """Classify the query intent.

    Returns one of: "spec_heavy", "rough_description", "model_number", "comparable_product"
    """
    models = extract_model_numbers(query)
    specs = extract_numeric_specs(query)
    has_comparable = bool(_COMPARABLE_KEYWORDS.search(query))

    if models and has_comparable:
        return "comparable_product"
    if models:
        return "model_number"

    # Count numeric spec indicators
    spec_count = len(specs)
    # Also check for unit-bearing tokens even if regex didn't fire
    unit_tokens = len(re.findall(
        r'\d+\.?\d*\s*(?:CFM|GPM|W|lm|V|BTU|PSI|dB|LPW|K|"|inch|watts?|lumens?)',
        query, re.IGNORECASE,
    ))
    if spec_count >= 2 or unit_tokens >= 2:
        return "spec_heavy"

    # Check for feature/spec keywords without numbers
    spec_keywords = [
        "dimmable", "dimming", "ada", "energy star", "compliant",
        "recessed", "wall mount", "undermount", "led",
    ]
    keyword_hits = sum(1 for kw in spec_keywords if kw in query.lower())
    if spec_count >= 1 and keyword_hits >= 1:
        return "spec_heavy"

    return "rough_description"


# ---------------------------------------------------------------------------
# Detected specs (for the search metadata response)
# ---------------------------------------------------------------------------

def detected_specs(query: str) -> Dict[str, Any]:
    """Extract all detected specs from a query for the API response."""
    specs = extract_numeric_specs(query)
    models = extract_model_numbers(query)
    result: Dict[str, Any] = dict(specs)
    if models:
        result["model_numbers"] = models
    return result


# ---------------------------------------------------------------------------
# Match explanation
# ---------------------------------------------------------------------------

_FINISH_NAMES = {
    "chrome": "Chrome",
    "stainless": "Stainless Steel",
    "matte black": "Matte Black",
    "black": "Black",
    "white": "White",
    "brushed nickel": "Brushed Nickel",
    "bronze": "Bronze",
}

_DIMMING_TERMS_QUERY = ["dimmable", "dimming", "dimmer"]
_DIMMING_TERMS_CHUNK = ["0-10v", "0-10 v", "triac", "elv", "lutron", "dimming", "dimmable"]

CCT_VALUES = [2700, 3000, 3500, 4000, 5000, 6500]


def explain_match(query: str, chunk: Dict[str, Any]) -> Dict[str, Any]:
    """Produce human-readable match explanations.

    Returns:
        {
            "why_matched": ["Matched CCT: 3000K", "Finish bridge: dimmable → 0-10V", ...],
            "matched_specs": {"cct_kelvin": 3000, ...},
            "missing_specs": {"gpm": 1.5, ...},
        }
    """
    why: List[str] = []
    matched_specs: Dict[str, Any] = {}
    missing_specs: Dict[str, Any] = {}

    query_lower = query.lower()
    chunk_text = chunk.get("chunk_text", "").lower()
    query_specs = extract_numeric_specs(query)
    chunk_specs = chunk.get("numeric_specs", {})
    query_models = extract_model_numbers(query)

    # Model match
    for model in query_models:
        if model.upper() in chunk.get("chunk_text", "").upper():
            why.append(f"Model exact: {model}")
        elif model.upper() in chunk.get("title", "").upper():
            why.append(f"Model in title: {model}")

    # Spec matching
    for spec_key, q_val in query_specs.items():
        q_vals = q_val if isinstance(q_val, list) else [q_val]
        if spec_key in chunk_specs:
            c_val = chunk_specs[spec_key]
            c_vals = c_val if isinstance(c_val, list) else [c_val]
            for qv in q_vals:
                for cv in c_vals:
                    try:
                        if abs(float(qv) - float(cv)) < 0.01 * max(float(qv), 1.0):
                            why.append(f"Matched {spec_key}: {qv}")
                            matched_specs[spec_key] = qv
                    except (TypeError, ValueError):
                        continue
            if spec_key not in matched_specs:
                missing_specs[spec_key] = q_vals[0] if len(q_vals) == 1 else q_vals
        else:
            missing_specs[spec_key] = q_vals[0] if len(q_vals) == 1 else q_vals

    # CCT match
    for cct in CCT_VALUES:
        cct_str = str(cct)
        if cct_str in query and cct_str in chunk.get("chunk_text", ""):
            why.append(f"Matched CCT: {cct}K")
            matched_specs["cct_kelvin"] = cct

    # Finish bridge
    for finish_key, finish_label in _FINISH_NAMES.items():
        if finish_key in query_lower and finish_key in chunk_text:
            why.append(f"Finish match: {finish_label}")

    # Dimming bridge: "dimmable" → "0-10V"
    query_wants_dimming = any(t in query_lower for t in _DIMMING_TERMS_QUERY)
    if query_wants_dimming:
        chunk_has_dimming = any(t in chunk_text for t in _DIMMING_TERMS_CHUNK)
        if chunk_has_dimming:
            why.append("Finish bridge: dimmable → 0-10V")
        else:
            missing_specs["dimming"] = "dimmable"

    # Section preference note
    section = chunk.get("section_type", "general")
    if section in ("ordering", "specs", "photometrics"):
        why.append(f"Section preference: {section}")

    return {
        "why_matched": why,
        "matched_specs": matched_specs,
        "missing_specs": missing_specs,
    }