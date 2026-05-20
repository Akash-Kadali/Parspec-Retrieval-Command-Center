"""Reranker — domain-aware boosting, model-number detection, RRF fusion."""

import re
from typing import List, Dict, Any

from backend.app.core.config import settings
from backend.app.services.spec_extractor import extract_numeric_specs, extract_model_numbers

MODEL_PATTERN = re.compile(r"\b[A-Z]{2,}[A-Z0-9\-]{2,}\b")

FINISH_SYNONYMS: Dict[str, List[str]] = {
    "chrome": ["chrome", "polished chrome", "chr", "cp"],
    "stainless": ["stainless", "stainless steel", "ss", "satin stainless"],
    "matte black": ["matte black", "mb", "flat black", "blk"],
    "black": ["black", "blk", "bk", "textured black", "matte black"],
    "white": ["white", "wh", "wht", "textured white", "matte white"],
    "brushed nickel": ["brushed nickel", "bn", "satin nickel", "nickel"],
    "bronze": ["bronze", "brz", "oil rubbed bronze", "orb"],
}

DIMMING_TERMS = [
    "0-10v", "0-10 v", "dim", "dimming", "dimmable", "dimmer",
    "triac", "elv", "mlv", "lutron", "phase dim",
    "trailing edge", "leading edge", "forward phase",
]

CCT_VALUES = [2700, 3000, 3500, 4000, 5000, 6500]

UNIT_KEYWORDS = {
    "gpm": ["gpm", "gallons per minute", "flow rate"],
    "cfm": ["cfm", "cubic feet", "airflow", "air flow"],
    "lumens": ["lumens", "lm", "delivered lumens", "total lumens"],
    "watts": ["watts", "watt", "w ", "input power"],
    "voltage": ["volt", "voltage", "120v", "277v", "240v"],
    "btu": ["btu", "british thermal"],
    "inches": ["inch", '"', "in.", "diameter"],
}



def _load_calibrated_weights() -> Dict[str, float]:
    """Load optional calibrated weights; fall back to safe defaults."""
    import json
    from pathlib import Path

    path = Path(settings.project_root) / "eval" / "calibration_results.json"
    if not path.exists():
        return RERANKER_WEIGHTS.copy()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        weights = RERANKER_WEIGHTS.copy()
        weights.update(payload.get("best_weights", {}))
        return weights
    except Exception:
        return RERANKER_WEIGHTS.copy()


# These weights were calibrated via grid search over the eval query set
# (see backend/scripts/calibrate_reranker.py). The calibration optimizes for
# MRR@5 across spec-heavy, rough-description, and model-number query types.
RERANKER_WEIGHTS: Dict[str, float] = {
    "model_match": 0.30,
    "model_title": 0.20,
    "numeric_match": 0.08,
    "spec_exact": 0.10,
    "finish_match": 0.06,
    "cct_match": 0.08,
    "dimming_bridge": 0.06,
    "unit_match": 0.04,
    "section_relevant_boost": 0.03,
    "section_toc_penalty": -0.10,
    "section_cert_penalty": -0.02,
    "kw_ada": 0.05,
    "kw_recessed": 0.05,
    "kw_wall_mount": 0.05,
    "kw_undermount": 0.05,
    "kw_led": 0.03,
    "kw_brass": 0.03,
    "kw_copper": 0.03,
    "kw_ceramic": 0.03,
    "kw_energy_star": 0.04,
    "kw_commercial": 0.03,
    "kw_residential": 0.02,
}


def rrf_fuse(
    ranked_lists: List[List[Dict[str, Any]]],
    k: int = None,
    score_key: str = "score",
    id_key: str = "chunk_id",
) -> List[Dict[str, Any]]:
    if k is None:
        k = settings.rrf_k
    scores: Dict[str, float] = {}
    items: Dict[str, Dict[str, Any]] = {}
    for ranked_list in ranked_lists:
        for rank, item in enumerate(ranked_list):
            item_id = item.get(id_key, str(rank))
            rrf_score = 1.0 / (k + rank + 1)
            scores[item_id] = scores.get(item_id, 0.0) + rrf_score
            if item_id not in items:
                items[item_id] = item.copy()
    for item_id, item in items.items():
        item["rrf_score"] = scores[item_id]
    return sorted(items.values(), key=lambda x: x["rrf_score"], reverse=True)


def rerank_results(
    query: str,
    results: List[Dict[str, Any]],
    weights: Dict[str, float] | None = None,
) -> List[Dict[str, Any]]:
    weights = weights or _load_calibrated_weights()
    query_lower = query.lower()
    query_nums = re.findall(r"\d+(?:\.\d+)?", query)
    query_models = extract_model_numbers(query)
    query_specs = extract_numeric_specs(query)

    has_product_attrs = any(kw in query_lower for kw in [
        "gpm", "cfm", "lumen", "watt", "volt", "btu", "inch", "dim",
        "chrome", "black", "white", "nickel", "stainless", "bronze",
        "recessed", "wall mount", "faucet", "fan", "downlight",
        "led", "ada", "compliant",
    ])

    reranked = []
    for original in results:
        item = original.copy()
        boost = 0.0
        matched_fields: List[str] = []
        text = item.get("chunk_text", "")
        text_lower = text.lower()
        text_upper = text.upper()
        title = item.get("title", "").upper()

        for model in query_models:
            if model in text_upper:
                boost += weights["model_match"]
                matched_fields.append(f"model:{model}")
            elif model in title:
                boost += weights["model_title"]
                matched_fields.append(f"model_title:{model}")

        for num in query_nums:
            if num in text:
                boost += weights["numeric_match"]
                matched_fields.append(f"num:{num}")

        chunk_specs = item.get("numeric_specs", {})
        for spec_key in query_specs:
            if spec_key in chunk_specs:
                q_val = query_specs[spec_key]
                c_val = chunk_specs[spec_key]
                q_vals = q_val if isinstance(q_val, list) else [q_val]
                c_vals = c_val if isinstance(c_val, list) else [c_val]
                for qv in q_vals:
                    for cv in c_vals:
                        try:
                            if abs(float(qv) - float(cv)) < 0.01 * max(float(qv), 1.0):
                                boost += weights["spec_exact"]
                                matched_fields.append(f"spec_exact:{spec_key}={qv}")
                        except (TypeError, ValueError):
                            continue

        for finish_key, synonyms in FINISH_SYNONYMS.items():
            if any(syn in query_lower for syn in synonyms):
                if any(syn in text_lower for syn in synonyms):
                    boost += weights["finish_match"]
                    matched_fields.append(f"finish:{finish_key}")

        for cct in CCT_VALUES:
            cct_str = str(cct)
            if cct_str in query and cct_str in text:
                boost += weights["cct_match"]
                matched_fields.append(f"cct:{cct}K")

        query_wants_dimming = any(t in query_lower for t in ["dimmable", "dimming", "dimmer", "dim "])
        if query_wants_dimming and any(t in text_lower for t in DIMMING_TERMS):
            boost += weights["dimming_bridge"]
            matched_fields.append("dimming_bridge")

        for unit_key, unit_terms in UNIT_KEYWORDS.items():
            if any(t in query_lower for t in unit_terms) and any(t in text_lower for t in unit_terms):
                boost += weights["unit_match"]
                matched_fields.append(f"unit:{unit_key}")

        kw_boosts = {
            "ada": weights["kw_ada"],
            "recessed": weights["kw_recessed"],
            "wall mount": weights["kw_wall_mount"],
            "undermount": weights["kw_undermount"],
            "led": weights["kw_led"],
            "brass": weights["kw_brass"],
            "copper": weights["kw_copper"],
            "ceramic": weights["kw_ceramic"],
            "energy star": weights["kw_energy_star"],
            "commercial": weights["kw_commercial"],
            "residential": weights["kw_residential"],
        }
        for kw, kw_boost in kw_boosts.items():
            if kw in query_lower and kw in text_lower:
                boost += kw_boost
                matched_fields.append(f"kw:{kw}")

        section = item.get("section_type", "general")
        if has_product_attrs:
            if section in ("specs", "ordering", "photometrics"):
                boost += weights["section_relevant_boost"]
                matched_fields.append(f"section_pref:{section}")
            elif section == "certifications":
                boost += weights["section_cert_penalty"]
            elif section == "toc":
                boost += weights["section_toc_penalty"]
                matched_fields.append("section_demote:toc")
        elif section == "toc":
            boost += weights["section_toc_penalty"]
            matched_fields.append("section_demote:toc")

        item["score"] = float(item.get("score", 0) + boost)
        item["boost_applied"] = round(boost, 3)
        item["matched_fields"] = matched_fields
        reranked.append(item)

    reranked.sort(key=lambda x: x["score"], reverse=True)
    return reranked
