import json
import sys
from dataclasses import dataclass
from typing import Any, Dict, List

import requests


BASE_URL = "http://127.0.0.1:8000"


@dataclass
class CheckResult:
    name: str
    score: float
    max_score: float
    status: str
    details: str


def get(path: str) -> Any:
    r = requests.get(f"{BASE_URL}{path}", timeout=20)
    r.raise_for_status()
    return r.json()


def post(path: str, payload: Dict[str, Any] | None = None) -> Any:
    r = requests.post(f"{BASE_URL}{path}", json=payload, timeout=120)
    r.raise_for_status()
    return r.json()


def search(query: str, top_k: int = 5, method: str = "hybrid") -> Dict[str, Any]:
    return post(
        "/search",
        {
            "query": query,
            "top_k": top_k,
            "method": method,
        },
    )


def text_blob(results: List[Dict[str, Any]]) -> str:
    parts = []
    for r in results:
        parts.append(str(r.get("title", "")))
        parts.append(str(r.get("source_file", "")))
        parts.append(str(r.get("chunk_text", "")))
        parts.append(" ".join(map(str, r.get("why_matched", []))))
    return " ".join(parts).lower()


def add_result(results: List[CheckResult], name: str, score: float, max_score: float, ok: bool, details: str):
    results.append(
        CheckResult(
            name=name,
            score=score,
            max_score=max_score,
            status="PASS" if ok else "FAIL",
            details=details,
        )
    )


def main():
    checks: List[CheckResult] = []

    # 1. Health
    try:
        health = get("/health")
        ok = health.get("status") == "ok"
        add_result(checks, "Backend health", 10 if ok else 0, 10, ok, json.dumps(health))
    except Exception as e:
        add_result(checks, "Backend health", 0, 10, False, str(e))
        print_report(checks)
        sys.exit(1)

    # 2. Status
    try:
        status = get("/status")
        pdfs = int(status.get("pdfs_loaded", 0) or 0)
        chunks = int(status.get("chunks_indexed", 0) or 0)
        index_built = bool(status.get("index_built", False))
        ocr = bool(status.get("ocr_available", False))
        dense = bool(status.get("dense_embeddings_enabled", False))
        bm25 = bool(status.get("bm25_enabled", False))
        ce = bool(status.get("cross_encoder_available", False))

        add_result(checks, "PDF corpus loaded", 10 if pdfs >= 6 else 5 if pdfs > 0 else 0, 10, pdfs >= 6, f"pdfs_loaded={pdfs}")
        add_result(checks, "Chunks created", 15 if chunks > 0 else 0, 15, chunks > 0, f"chunks_indexed={chunks}")
        add_result(checks, "Index built", 10 if index_built else 0, 10, index_built, f"index_built={index_built}")
        add_result(checks, "OCR available", 8 if ocr else 0, 8, ocr, f"ocr_available={ocr}")
        add_result(checks, "Dense retrieval available", 8 if dense else 0, 8, dense, f"dense_embeddings_enabled={dense}")
        add_result(checks, "BM25 available", 8 if bm25 else 0, 8, bm25, f"bm25_enabled={bm25}")
        add_result(checks, "Cross-encoder available", 8 if ce else 0, 8, ce, f"cross_encoder_available={ce}")
    except Exception as e:
        add_result(checks, "Status endpoint", 0, 67, False, str(e))

    # 3. Documents
    try:
        docs = get("/documents")
        documents = docs.get("documents", [])
        parsed = sum(1 for d in documents if d.get("parsed"))
        indexed = sum(1 for d in documents if d.get("indexed"))
        total_chunks = sum(int(d.get("num_chunks", 0) or 0) for d in documents)

        ok = len(documents) >= 6 and parsed >= 6 and indexed >= 6 and total_chunks > 0
        score = 15 if ok else 8 if len(documents) >= 6 else 0
        add_result(
            checks,
            "Document metadata quality",
            score,
            15,
            ok,
            f"documents={len(documents)}, parsed={parsed}, indexed={indexed}, document_chunks={total_chunks}",
        )
    except Exception as e:
        add_result(checks, "Document metadata quality", 0, 15, False, str(e))

    # 4. Query tests
    query_tests = [
        {
            "name": "Spec-heavy downlight query",
            "query": '6" recessed downlight, 3000K, black trim, dimmable',
            "must_contain_any": ["crc-di", "downlight", "3000k", "0-10v", "black"],
            "max_score": 20,
        },
        {
            "name": "Model-number KBF514 query",
            "query": "KBF514",
            "must_contain_any": ["kbf514", "karran", "faucet"],
            "max_score": 15,
        },
        {
            "name": "Comparable product query",
            "query": "Karran KBF514 find comparable products",
            "must_contain_any": ["kbf514", "karran", "faucet"],
            "max_score": 10,
        },
        {
            "name": "Whole-house fan query",
            "query": "whole house fan 1434 CFM energy star",
            "must_contain_any": ["qc-es-1500", "quietcool", "1434", "energy star", "whole house fan"],
            "max_score": 15,
        },
        {
            "name": "High-bay table/model query",
            "query": "FCY0815L8CST 8508 lumens 55.2 watts",
            "must_contain_any": ["fcy0815", "8508", "55.2", "high bay"],
            "max_score": 15,
        },
        {
            "name": "No-match wire query",
            "query": "#12 THHN copper wire 600V",
            "must_contain_any": [],
            "max_score": 7,
            "no_match_expected": True,
        },
    ]

    for t in query_tests:
        try:
            res = search(t["query"], top_k=5)
            results = res.get("results", [])
            blob = text_blob(results)

            if t.get("no_match_expected"):
                # For out-of-corpus query, either empty results or low-confidence unrelated results is acceptable.
                high_conf = any(float(r.get("score", 0) or 0) >= 0.75 for r in results)
                ok = not high_conf
                score = t["max_score"] if ok else 0
                details = f"results={len(results)}, high_conf_result={high_conf}"
            else:
                matched_terms = [term for term in t["must_contain_any"] if term.lower() in blob]
                ok = len(results) > 0 and len(matched_terms) > 0
                score = t["max_score"] if ok else 0
                details = f"results={len(results)}, matched_terms={matched_terms}"

            add_result(checks, t["name"], score, t["max_score"], ok, details)

        except Exception as e:
            add_result(checks, t["name"], 0, t["max_score"], False, str(e))

    # 5. Evidence and evaluation endpoints
    try:
        evidence = get("/evidence")
        ok = isinstance(evidence, list) and len(evidence) >= 6
        add_result(checks, "Evidence endpoint", 8 if ok else 0, 8, ok, f"evidence_items={len(evidence) if isinstance(evidence, list) else 'not_list'}")
    except Exception as e:
        add_result(checks, "Evidence endpoint", 0, 8, False, str(e))

    try:
        eval_res = post("/evaluation/run")
        ok = isinstance(eval_res, dict)
        add_result(checks, "Evaluation endpoint", 6 if ok else 0, 6, ok, "evaluation endpoint responded")
    except Exception as e:
        add_result(checks, "Evaluation endpoint", 0, 6, False, str(e))

    print_report(checks)


def print_report(checks: List[CheckResult]):
    total = sum(c.score for c in checks)
    max_total = sum(c.max_score for c in checks)
    percent = (total / max_total * 100) if max_total else 0

    print("\n" + "=" * 78)
    print(" PARSPEC ASSIGNMENT TERMINAL SCORE")
    print("=" * 78)
    print(f"Total Score: {total:.1f} / {max_total:.1f}  ({percent:.1f}%)")

    if percent >= 90:
        grade = "Excellent / submission-ready"
    elif percent >= 75:
        grade = "Good, but needs polish"
    elif percent >= 60:
        grade = "Working MVP, but incomplete"
    else:
        grade = "Not submission-ready"

    print(f"Grade: {grade}")
    print("-" * 78)

    for c in checks:
        print(f"[{c.status}] {c.name}: {c.score:.1f}/{c.max_score:.1f}")
        print(f"       {c.details}")

    print("=" * 78)

    report = {
        "total_score": total,
        "max_score": max_total,
        "percent": percent,
        "grade": grade,
        "checks": [c.__dict__ for c in checks],
    }

    out = "eval/terminal_score_report.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"\nSaved JSON report to: {out}\n")


if __name__ == "__main__":
    main()
