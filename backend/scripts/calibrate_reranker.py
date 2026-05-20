"""Coordinate-wise grid search over reranker weights using the eval query set."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List

project_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(project_root))

from backend.app.core.config import settings
from backend.app.services.reranker import RERANKER_WEIGHTS, rerank_results
from backend.app.services.retriever import load_index, _bm25_search, _dense_search, _tfidf_search

WEIGHT_GRID = {
    "model_match": [0.15, 0.25, 0.35, 0.45],
    "model_title": [0.10, 0.20, 0.30],
    "numeric_match": [0.04, 0.08, 0.12],
    "spec_exact": [0.05, 0.10, 0.15],
    "finish_match": [0.03, 0.06, 0.10],
    "cct_match": [0.04, 0.08, 0.12],
    "dimming_bridge": [0.03, 0.06, 0.10],
    "section_relevant_boost": [0.02, 0.04, 0.06],
    "section_toc_penalty": [-0.15, -0.10, -0.05],
    "section_cert_penalty": [-0.04, -0.02, 0.0],
}


def _match_file(actual: str, expected: str) -> bool:
    return bool(expected) and expected.lower() in (actual or "").lower()


def _candidate_results(query: str, payload: dict, fetch_k: int = 25) -> List[Dict[str, Any]]:
    # Calibration isolates the rule reranker, so use the same candidate pool as hybrid search
    # but skip confidence gating/cross-encoder.
    rows: List[Dict[str, Any]] = []
    for fn in (_dense_search, _tfidf_search, _bm25_search):
        rows.extend(fn(query, payload, fetch_k))
    seen = {}
    for row in rows:
        cid = row.get("chunk_id")
        if cid not in seen or row.get("score", 0) > seen[cid].get("score", 0):
            seen[cid] = row
    return list(seen.values())


def evaluate_with_weights(queries: List[Dict[str, Any]], weights: Dict[str, float]) -> Dict[str, float]:
    payload = load_index()
    reciprocal_sum = 0.0
    section_ok = 0.0
    match_count = 0
    for item in queries:
        if not item.get("should_match", True):
            continue
        match_count += 1
        candidates = _candidate_results(item["query"], payload)
        ranked = rerank_results(item["query"], candidates, weights=weights)[:5]
        rank = None
        for i, result in enumerate(ranked, start=1):
            if _match_file(result.get("source_file", ""), item.get("expected_file", "")):
                rank = i
                break
        reciprocal_sum += 1.0 / rank if rank else 0.0
        if rank and item.get("expected_section"):
            if item["expected_section"].lower() in ranked[rank - 1].get("section_type", "").lower():
                section_ok += 1.0
    denom = max(match_count, 1)
    return {"mrr": reciprocal_sum / denom, "section_accuracy": section_ok / denom}


def grid_search() -> Dict[str, Any]:
    query_path = Path(settings.project_root) / "eval" / "queries.json"
    queries = json.loads(query_path.read_text(encoding="utf-8"))

    best_weights = RERANKER_WEIGHTS.copy()
    best_metrics = evaluate_with_weights(queries, best_weights)
    search_log = [{"stage": "baseline", "metrics": best_metrics, "weights": best_weights}]

    for name, values in WEIGHT_GRID.items():
        local_best_value = best_weights[name]
        local_best_metrics = best_metrics
        for value in values:
            trial = best_weights.copy()
            trial[name] = value
            metrics = evaluate_with_weights(queries, trial)
            search_log.append({"stage": f"sweep:{name}", "value": value, "metrics": metrics})
            if (metrics["mrr"], metrics["section_accuracy"]) > (
                local_best_metrics["mrr"], local_best_metrics["section_accuracy"]
            ):
                local_best_value = value
                local_best_metrics = metrics
        best_weights[name] = local_best_value
        best_metrics = local_best_metrics

    payload = {
        "best_weights": best_weights,
        "best_mrr": round(best_metrics["mrr"], 4),
        "best_section_accuracy": round(best_metrics["section_accuracy"], 4),
        "search_log": search_log,
    }
    out = Path(settings.project_root) / "eval" / "calibration_results.json"
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({k: payload[k] for k in ["best_mrr", "best_section_accuracy"]}, indent=2))
    return payload


if __name__ == "__main__":
    grid_search()
