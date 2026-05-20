"""Run offline retrieval evaluation and write eval/results.json."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

project_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(project_root))

from backend.app.core.config import settings
from backend.app.services.retriever import search_chunks


def _match_file(actual: str, expected: str) -> bool:
    return bool(expected) and expected.lower() in (actual or "").lower()


def run_evaluation(query_file: str = "eval/queries.json") -> Dict[str, Any]:
    root = Path(settings.project_root)
    query_path = Path(query_file)
    if not query_path.is_absolute():
        query_path = root / query_path

    suffix = "results" if query_path.name == "queries.json" else query_path.stem.replace("queries", "results")
    out_path = root / "eval" / f"{suffix}.json"

    if not query_path.exists():
        raise FileNotFoundError(f"Missing {query_path}")
    queries = json.loads(query_path.read_text(encoding="utf-8"))
    rows: List[Dict[str, Any]] = []
    top1 = top3 = section_ok = no_match_ok = reciprocal_sum = 0.0
    latencies = []

    for item in queries:
        q = item["query"]
        should_match = item.get("should_match", True)
        expected_file = item.get("expected_file", "")
        expected_section = item.get("expected_section", "")
        t0 = time.perf_counter()
        try:
            results = search_chunks(q, 5, "hybrid")
        except Exception as e:
            results = []
            err = str(e)
        else:
            err = ""
        latency_ms = round((time.perf_counter() - t0) * 1000, 1)
        latencies.append(latency_ms)
        actual_top = results[0] if results else {}
        rank = None
        for i, r in enumerate(results, start=1):
            if _match_file(r.get("source_file", ""), expected_file):
                rank = i
                break
        if should_match:
            hit1 = rank == 1
            hit3 = rank is not None and rank <= 3
            top1 += 1 if hit1 else 0
            top3 += 1 if hit3 else 0
            reciprocal_sum += 1.0 / rank if rank else 0.0
            section_hit = bool(
                rank
                and expected_section
                and expected_section.lower() in results[rank - 1].get("section_type", "").lower()
            )
            section_ok += 1 if section_hit else 0
            passed = hit3
        else:
            no_strong = (not results) or all(
                r.get("confidence_label") == "no_match" or not r.get("above_threshold", False)
                for r in results[:3]
            )
            no_match_ok += 1 if no_strong else 0
            passed = no_strong
        rows.append({
            "query": q,
            "expected_file": expected_file,
            "expected_section": expected_section,
            "actual_top_file": actual_top.get("source_file", ""),
            "actual_top_section": actual_top.get("section_type", ""),
            "rank": rank,
            "pass": passed,
            "confidence": actual_top.get("score", 0),
            "confidence_label": actual_top.get("confidence_label", ""),
            "latency_ms": latency_ms,
            "error": err,
        })

    match_count = max(1, sum(1 for q in queries if q.get("should_match", True)))
    no_count = max(1, sum(1 for q in queries if not q.get("should_match", True)))
    metrics = {
        "query_file": str(query_path.relative_to(root)) if query_path.is_relative_to(root) else str(query_path),
        "top_1_accuracy": round(top1 / match_count, 3),
        "top_3_accuracy": round(top3 / match_count, 3),
        "section_accuracy": round(section_ok / match_count, 3),
        "MRR": round(reciprocal_sum / match_count, 3),
        "no_match_accuracy": round(no_match_ok / no_count, 3),
        "average_latency_ms": round(sum(latencies) / max(1, len(latencies)), 1),
        "num_queries": len(queries),
    }
    payload = {"metrics": metrics, "results": rows}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    if out_path.name != "results.json":
        (root / "eval" / "results.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print("Evaluation report")
    for k, v in metrics.items():
        print(f"  {k}: {v}")
    return payload


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--query-file", default="eval/queries.json")
    args = parser.parse_args()
    run_evaluation(args.query_file)
