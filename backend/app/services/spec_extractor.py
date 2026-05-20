"""Numeric spec extraction, model number detection, manufacturer and domain inference.

Extracts structured spec values (CFM, GPM, watts, lumens, voltage, etc.)
using domain-specific regex patterns. Also detects model numbers,
manufacturer names, and product domains from datasheet text.
"""

import re
from typing import Dict, Any, List, Tuple

# ---------------------------------------------------------------------------
# Numeric spec patterns
# ---------------------------------------------------------------------------

SPEC_PATTERNS = {
    "cfm": [
        r"(\d[\d,]*)\s*CFM",
        r"Air\s*Flow[:\s]*(\d[\d,]*)",
        r"Airflow[:\s(]*(?:rated)?[:\s)]*(\d[\d,]*)",
    ],
    "watts": [
        r"(\d+\.?\d*)\s*W(?:atts?)?(?:\s|$|,)",
        r"Input\s*(?:Power|Watts?)[:\s]*(\d+\.?\d*)",
    ],
    "gpm": [
        r"(\d+\.?\d*)\s*GPM",
        r"Flow\s*Rate[:\s]*(\d+\.?\d*)\s*GPM",
    ],
    "lumens": [
        r"(?<![.\d])(\d[\d,]+)\s*(?:lm|lumens?)\b(?!\s*/\s*[Ww])",
        r"Delivered\s*Lumens[:\s]*(\d[\d,]*)",
    ],
    "voltage": [
        r"(\d+)\s*V(?:olts?)?(?:\s|$|/|,)",
        r"Voltage[:\s]*(\d+)",
    ],
    "btu": [
        r"(\d[\d,.]*[KkMm]?)\s*BTU",
    ],
    "size_inches": [
        r'(\d+\.?\d*)\s*(?:["\u201c\u201d\u2033]|in(?:ch(?:es)?)?\b)',
    ],
    "cct_kelvin": [
        r"(\d{4})\s*K\b",
    ],
    "cri": [
        r"(?:CRI|Color\s*Rendering)[:\s]*(\d+)",
    ],
    "db_noise": [
        r"(\d+\.?\d*)\s*dB",
    ],
    "psi": [
        r"(\d+\.?\d*)\s*PSI",
    ],
    "lpw": [
        r"(\d+\.?\d*)\s*(?:LPW|lm/W)",
    ],
}


def extract_numeric_specs(text: str) -> Dict[str, Any]:
    """Extract all numeric spec values with unit normalization.

    Returns a dict like:
        {"cfm": [1434.0, 1010.0], "watts": 64.5, "voltage": 120.0}
    Lists are used when multiple values of the same type are found.
    """
    specs: Dict[str, Any] = {}
    for spec_name, patterns in SPEC_PATTERNS.items():
        values: List[float] = []
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for m in matches:
                cleaned = m.replace(",", "").strip()
                try:
                    values.append(float(cleaned))
                except ValueError:
                    if cleaned.upper().endswith("K"):
                        try:
                            values.append(float(cleaned[:-1]) * 1000)
                        except ValueError:
                            pass
                    elif cleaned.upper().endswith("M"):
                        try:
                            values.append(float(cleaned[:-1]) * 1_000_000)
                        except ValueError:
                            pass
        # Deduplicate preserving order
        seen = set()
        unique = []
        for v in values:
            if v not in seen:
                seen.add(v)
                unique.append(v)
        if unique:
            specs[spec_name] = unique if len(unique) > 1 else unique[0]
    return specs


# ---------------------------------------------------------------------------
# Model number extraction
# ---------------------------------------------------------------------------

# Matches patterns like: cRC-DI-6-30, KBF514, QC-ES-1500-RF, FCY0815, 3470AB
# NOTE: We search the ORIGINAL text (not uppercased) so mixed-case like cRC-DI works,
# but the regex itself is case-insensitive for the letter parts.
MODEL_NUMBER_RE = re.compile(
    r"""
    \b
    (?:
        [a-zA-Z]{1,5}[\-]?[a-zA-Z0-9]{1,5}[\-][a-zA-Z0-9\-]{2,20}  # cRC-DI-6-30, QC-ES-1500-RF
        |[a-zA-Z]{2,5}\d{3,6}[a-zA-Z]{0,3}                           # KBF514, FCY0815, KBF514SS
        |\d{3,5}[a-zA-Z]{2,4}                                         # 3470AB
    )
    \b
    """,
    re.VERBOSE,
)

# Regex to filter out measurement values that look like model numbers
_MEASUREMENT_RE = re.compile(r"^\d+[A-Za-z]{1,2}$")  # 3000K, 277V, 12W, 850LM

# Filter out common false positives
_MODEL_BLOCKLIST = {
    "PDF", "LED", "CFM", "GPM", "BTU", "PSI", "CRI", "LPW", "ADA", "ETL",
    "UPC", "NSF", "BAA", "BABA", "CUL", "USA", "ECM", "IES", "RGB",
    "ISO", "ANSI", "NEMA", "ASHRAE", "LEED", "NEC", "CSA", "FCC",
    "ROHS", "DLC", "UNV",
    # Common English words that match alpha-dash-alpha
    "HIGH-EFFICACY", "NON-IC", "ENERGY-STAR", "SELF-CONTAINED",
    "LOW-PROFILE", "FULL-RANGE", "WIDE-FLOOD", "SEMI-RECESSED",
}


def extract_model_numbers(text: str) -> List[str]:
    """Extract likely product model numbers from text.

    Returns deduplicated list ordered by first occurrence.
    Filters out unit-like tokens (3000K, 277V, 12W) and common word compounds.

    IMPORTANT: We search the original text (preserving case) so mixed-case
    model numbers like cRC-DI are found, then uppercase the result for
    consistent comparison.
    """
    candidates = MODEL_NUMBER_RE.findall(text)
    seen = set()
    result = []
    for c in candidates:
        c_clean = c.strip("-")
        c_upper = c_clean.upper()
        if c_upper in _MODEL_BLOCKLIST or len(c_clean) < 4:
            continue
        # Filter out measurement-like tokens: pure digits + 1-2 letter unit
        if _MEASUREMENT_RE.match(c_clean):
            continue
        # Filter out all-alpha tokens (likely words, not model numbers)
        if c_clean.replace("-", "").isalpha():
            continue
        if c_upper not in seen:
            seen.add(c_upper)
            result.append(c_upper)
    return result


# ---------------------------------------------------------------------------
# Manufacturer detection
# ---------------------------------------------------------------------------

KNOWN_MANUFACTURERS = [
    # Assignment-specific manufacturers
    "Karran", "QuietCool", "Day-Brite", "Day Brite", "Red-White Valve",
    "ESI Lighting", "IWI", "Signify",
    # Broader industry
    "Cree", "Lithonia", "Acuity", "RAB", "Hubbell", "Eaton", "Cooper",
    "Philips", "GE", "Sylvania", "LEDVANCE", "MaxLite",
    "TCP", "Satco", "Halo", "Juno", "Lutron", "Leviton", "Legrand",
    "Kohler", "Moen", "Delta", "Grohe", "Hansgrohe",
    "Toto", "American Standard", "Broan", "NuTone", "Panasonic",
    "Big Ass Fans", "Hunter", "Emerson", "Fanimation", "Progress",
    "Quorum", "Kichler", "Sea Gull", "Generation", "Visual Comfort",
]

# Additional patterns for manufacturers embedded in URLs/text
_MFR_URL_PATTERNS = [
    (r"karran\.com", "Karran"),
    (r"quietcoolsystems\.com", "QuietCool"),
    (r"genlyte\.com", "Day-Brite"),
    (r"signify\.com", "Signify"),
    (r"esilighting\.com", "ESI Lighting"),
    (r"iwiinc\.com", "IWI"),
    (r"redwhitevalvecorp\.com", "Red-White Valve"),
    (r"Karran\s+USA", "Karran"),
    (r"QuietCool\b", "QuietCool"),
    (r"Energy\s+Solutions\s+International", "ESI Lighting"),
    (r"IWI\s+Incorporated", "IWI"),
    (r"Consta-?Flow", "IWI"),
]


def detect_manufacturer(text: str) -> str:
    """Return the first known manufacturer name found in text, or empty string."""
    # Check URL patterns first (most reliable)
    for pattern, mfr in _MFR_URL_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return mfr
    # Then check known names
    text_lower = text.lower()
    for mfr in KNOWN_MANUFACTURERS:
        if mfr.lower() in text_lower:
            return mfr
    return ""


# ---------------------------------------------------------------------------
# Domain detection
# ---------------------------------------------------------------------------

DOMAIN_KEYWORDS = {
    "lighting": ["lumen", "candela", "photometric", "downlight", "troffer",
                  "recessed", "led fixture", "watt per foot", "color temperature",
                  "cct", "cri ", "efficacy", "lpw", "high bay"],
    "plumbing": ["faucet", "gpm", "flow rate", "valve", "drain", "spout",
                 "aerator", "cupc", "lavatory", "basin", "sink"],
    "hvac": ["cfm", "airflow", "btu", "sone", "duct", "ventilat", "fan",
             "blower", "exhaust", "heating", "cooling", "whole house"],
    "electrical": ["circuit breaker", "panel", "amp", "busbar", "conduit",
                   "wire gauge", "receptacle", "switch gear"],
}


def detect_domain(text: str) -> str:
    """Return the most likely product domain based on keyword frequency."""
    text_lower = text.lower()
    scores: Dict[str, int] = {}
    for domain, keywords in DOMAIN_KEYWORDS.items():
        scores[domain] = sum(1 for kw in keywords if kw in text_lower)
    best = max(scores, key=scores.get) if scores else ""
    return best if scores.get(best, 0) > 0 else ""


# ---------------------------------------------------------------------------
# Text attribute extraction (used by chunker for metadata)
# ---------------------------------------------------------------------------

_FINISH_PATTERNS = {
    "chrome": [r"\bchrome\b", r"\bpolished\s+chrome\b"],
    "stainless_steel": [r"\bstainless\s+steel\b", r"\bstainless\b"],
    "matte_black": [r"\bmatte\s+black\b"],
    "brushed_nickel": [r"\bbrushed\s+nickel\b"],
    "bronze": [r"\bbronze\b", r"\boil\s+rubbed\s+bronze\b"],
    "white": [r"\bwhite\b"],
    "black": [r"\bblack\b"],
}

_CERT_PATTERNS = [
    r"\bADA\b", r"\bcUPC\b", r"\bETL\b", r"\bEnergy\s+Star\b",
    r"\bDLC\b", r"\bNSF\b", r"\bUL\b", r"\bCSA\b",
]

_MATERIAL_PATTERNS = {
    "brass": r"\bbrass\b",
    "stainless_steel": r"\bstainless\s+steel\b",
    "copper": r"\bcopper\b",
    "aluminum": r"\baluminum\b",
    "zinc": r"\bzinc\b",
    "ceramic": r"\bceramic\b",
    "cast_iron": r"\bcast\s+iron\b",
    "plastic": r"\bplastic\b",
}

_DIMMING_PATTERNS = [
    r"\b0-10\s*[Vv]\b", r"\bdimmable\b", r"\bdimming\b",
    r"\bTRIAC\b", r"\bELV\b", r"\bMLV\b", r"\bLutron\b",
]


def extract_text_attributes(text: str) -> Dict[str, Any]:
    """Extract structured attributes from free text for chunk metadata."""
    attrs: Dict[str, Any] = {}
    text_lower = text.lower()

    # Manufacturer
    mfr = detect_manufacturer(text)
    if mfr:
        attrs["manufacturer"] = mfr

    # Domain
    domain = detect_domain(text)
    if domain:
        attrs["domain"] = domain

    # Finishes
    finishes = []
    for finish_name, patterns in _FINISH_PATTERNS.items():
        for pat in patterns:
            if re.search(pat, text, re.IGNORECASE):
                finishes.append(finish_name)
                break
    if finishes:
        attrs["finishes"] = finishes

    # Materials
    for mat_name, pat in _MATERIAL_PATTERNS.items():
        if re.search(pat, text, re.IGNORECASE):
            attrs["material"] = mat_name
            break

    # Certifications
    certs = []
    for pat in _CERT_PATTERNS:
        if re.search(pat, text):
            certs.append(re.search(pat, text).group())
    if certs:
        attrs["certifications"] = certs

    # Dimming
    for pat in _DIMMING_PATTERNS:
        if re.search(pat, text, re.IGNORECASE):
            attrs["dimming"] = True
            break

    return attrs


# ---------------------------------------------------------------------------
# Synthetic query builder (for comparable-product search)
# ---------------------------------------------------------------------------

def build_synthetic_query(metadata: Dict[str, Any]) -> str:
    """Build a descriptive synthetic query from structured metadata.

    For example, KBF514 profile → "faucet brass 1.2 GPM chrome ADA compliant"
    """
    parts = []
    attrs = metadata.get("extracted_attributes", {})
    specs = metadata.get("numeric_specs", {})
    summary = metadata.get("summary", "")
    domain = metadata.get("domain", "")

    if domain:
        parts.append(domain)

    if "type" in attrs:
        parts.append(attrs["type"].lower())
    if "material" in attrs:
        parts.append(attrs["material"].lower())
    if "configuration" in attrs:
        parts.append(attrs["configuration"].lower())

    for key, unit in [("gpm", "GPM"), ("cfm", "CFM"), ("lumens", "lumens"),
                      ("watts", "W"), ("voltage", "V"), ("lpw", "LPW"),
                      ("cct_kelvin", "K"), ("size_inches", "inch")]:
        if key in specs:
            val = specs[key] if isinstance(specs[key], (int, float)) else specs[key][0]
            parts.append(f"{val} {unit}")

    if "finishes" in attrs:
        parts.extend(f.replace("_", " ") for f in attrs["finishes"][:2])

    if "certifications" in attrs:
        parts.extend(attrs["certifications"][:2])

    if "dimming" in attrs:
        parts.append("dimmable")

    if not parts and summary:
        return summary[:200]

    return " ".join(parts)