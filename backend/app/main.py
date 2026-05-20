"""
Parspec Datasheet Retrieval API — service-layer FastAPI entrypoint.

This API intentionally calls the real backend pipeline:
- parser / OCR / table extraction
- chunker
- hybrid indexer
- retriever with BM25 + TF-IDF + dense + reranking
- evidence and evaluation endpoints
"""

from __future__ import annotations

import json
import logging
import shutil
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.app.core.config import settings

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

logger = logging.getLogger(__name__)

ROOT = Path(settings.project_root)
DATA_DIR = Path(settings.data_dir)
RAW_DIR = Path(settings.raw_dir)
PARSED_DIR = Path(settings.parsed_dir)
CHUNKS_DIR = Path(settings.chunks_dir)
INDEX_DIR = Path(settings.index_dir)
EVIDENCE_DIR = Path(settings.evidence_dir)
EVAL_DIR = ROOT / "eval"

for path in [RAW_DIR, PARSED_DIR, CHUNKS_DIR, INDEX_DIR, EVIDENCE_DIR, EVAL_DIR]:
    path.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Parspec Datasheet Retrieval API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / helper models
# ---------------------------------------------------------------------------

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    method: str = "hybrid"


def _pdf_files() -> List[Path]:
    return sorted(RAW_DIR.glob("*.pdf"))


def _read_json_file(path: Path, default):
    try:
        if not path.exists():
            return default
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _load_chunks() -> List[Dict[str, Any]]:
    chunks_file = CHUNKS_DIR / "chunks.json"
    loaded = _read_json_file(chunks_file, [])
    return loaded if isinstance(loaded, list) else []


def _load_evidence_records() -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []

    for evidence_file in EVIDENCE_DIR.glob("*.json"):
        loaded = _read_json_file(evidence_file, None)

        if isinstance(loaded, dict):
            records.append(loaded)
        elif isinstance(loaded, list):
            records.extend(item for item in loaded if isinstance(item, dict))

    return records


def _evidence_by_file() -> Dict[str, Dict[str, Any]]:
    evidence_map: Dict[str, Dict[str, Any]] = {}

    for item in _load_evidence_records():
        if not isinstance(item, dict):
            continue

        filename = item.get("file") or item.get("filename")
        if filename:
            evidence_map[str(filename)] = item
            evidence_map[Path(str(filename)).stem] = item

    return evidence_map


def _default_result_fields(item: Dict[str, Any], query: str) -> Dict[str, Any]:
    """Normalize a chunk dict into the response schema expected by frontend."""
    score = float(item.get("score", 0.0) or 0.0)

    return {
        "score": score,
        "document_id": str(item.get("document_id", item.get("filename", ""))),
        "title": str(
            item.get(
                "title",
                item.get("source_file", item.get("filename", "Document")),
            )
        ),
        "source_file": str(item.get("source_file", item.get("filename", ""))),
        "page_number": int(item.get("page_number", item.get("page", 1)) or 1),
        "section_type": str(item.get("section_type", "general")),
        "chunk_text": str(item.get("chunk_text", item.get("text", ""))),
        "chunking_strategy": str(item.get("chunking_strategy", "unknown")),
        "extraction_method": str(item.get("extraction_method", "unknown")),
        "retrieval_method": str(item.get("retrieval_method", "hybrid")),
        "above_threshold": bool(item.get("above_threshold", score >= settings.confidence_threshold)),
        "confidence_note": str(item.get("confidence_note", "")),
        "confidence_label": str(item.get("confidence_label", "low" if score < 0.45 else "medium")),
        "boost_applied": float(item.get("boost_applied", 0.0) or 0.0),
        "numeric_specs": item.get("numeric_specs", {}),
        "model_numbers": item.get("model_numbers", []),
        "matched_fields": item.get("matched_fields", []),
        "matched_specs": item.get("matched_specs", {}),
        "missing_specs": item.get("missing_specs", {}),
        "why_matched": item.get("why_matched", []),
        "manufacturer": str(item.get("manufacturer", "")),
        "domain": str(item.get("domain", "")),
        "token_count": int(item.get("token_count", 0) or 0),
        "search_mode": str(item.get("search_mode", "standard")),
        "exact_match": bool(item.get("exact_match", False)),
        "comparable_search": bool(item.get("comparable_search", "comparable" in query.lower())),
        "comparable_reason": str(item.get("comparable_reason", "")),
    }


# ---------------------------------------------------------------------------
# Health & status
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/status")
def status():
    pdfs = _pdf_files()
    chunks = _load_chunks()
    evidence_records = _load_evidence_records()

    scanned_count = sum(
        1 for item in evidence_records if item.get("pdf_type") == "scanned"
    )
    native_count = sum(
        1 for item in evidence_records if item.get("pdf_type") == "native"
    )
    multi_col_count = sum(
        1
        for item in evidence_records
        if item.get("pdf_type") in {"multi_col", "multi-column", "multi_column"}
    )

    hybrid_index_exists = (INDEX_DIR / "hybrid_index.pkl").exists()

    cross_encoder_available = False
    try:
        from backend.app.services.cross_encoder import get_cross_encoder

        cross_encoder_available = bool(get_cross_encoder().available)
    except Exception:
        cross_encoder_available = False

    dense_available = False
    try:
        from backend.app.services.embedder import DenseEmbedder

        dense_available = bool(DenseEmbedder().available)
    except Exception:
        dense_available = False

    return {
        "backend_connected": True,
        "pdfs_loaded": len(pdfs),
        "chunks_indexed": len(chunks),
        "ocr_available": bool(shutil.which("tesseract") and shutil.which("pdftoppm")),
        "dense_embeddings_enabled": dense_available,
        "bm25_enabled": True,
        "index_built": hybrid_index_exists or len(chunks) > 0,
        "cross_encoder_available": cross_encoder_available,
        "data_paths": {
            "raw": str(RAW_DIR),
            "parsed": str(PARSED_DIR),
            "chunks": str(CHUNKS_DIR),
            "index": str(INDEX_DIR),
            "evidence": str(EVIDENCE_DIR),
        },
        "diagnostics": {
            "native_pdfs": native_count,
            "scanned_pdfs": scanned_count,
            "multi_column_pdfs": multi_col_count,
            "chunks_file": str(CHUNKS_DIR / "chunks.json"),
            "evidence_files": len(list(EVIDENCE_DIR.glob("*.json"))),
            "evidence_records": len(evidence_records),
            "hybrid_index": hybrid_index_exists,
        },
    }


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    content = await file.read()

    if not content.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid PDF")

    dest = RAW_DIR / Path(file.filename).name
    dest.write_bytes(content)

    return {
        "filename": dest.name,
        "size_bytes": len(content),
        "message": "Uploaded successfully",
    }


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------

@app.post("/ingest")
def ingest_all():
    try:
        from backend.app.services.indexer import ingest_all_pdfs

        stats = ingest_all_pdfs()
        stats.setdefault("message", "Ingest complete.")
        return stats
    except Exception as exc:
        logger.exception("Service-layer ingest failed")
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {exc}")


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

@app.post("/search")
def search(req: SearchRequest):
    query = req.query.strip()

    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    try:
        from backend.app.services.retriever import search_chunks, search_metadata

        results = search_chunks(query, top_k=req.top_k, method=req.method)
        meta = search_metadata(query)
        normalized = [_default_result_fields(item, query) for item in results]

        total_indexed = len(_load_chunks())

        return {
            "query": query,
            "method": req.method,
            "results": normalized,
            "total_indexed": total_indexed,
            "query_type": meta.get("query_type", "semantic"),
            "search_mode": meta.get("search_mode", "standard"),
            "detected_specs": meta.get("detected_specs", {}),
        }

    except FileNotFoundError:
        return {
            "query": query,
            "method": req.method,
            "results": [],
            "total_indexed": 0,
            "query_type": "semantic",
            "search_mode": "standard",
            "detected_specs": {},
        }
    except Exception as exc:
        logger.exception("Search failed")
        raise HTTPException(status_code=500, detail=f"Search failed: {exc}")


# ---------------------------------------------------------------------------
# Search explain
# ---------------------------------------------------------------------------

@app.post("/search/explain")
def explain(req: SearchRequest):
    query = req.query.strip()

    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    try:
        from backend.app.services.retriever import search_chunks, search_metadata
        from backend.app.services.query_understanding import detected_specs

        results = search_chunks(query, top_k=req.top_k, method=req.method)
        meta = search_metadata(query)
        specs = detected_specs(query)

        return {
            "query": query,
            "query_type": meta.get("query_type", "semantic"),
            "detected_specs": specs,
            "explanation": f"Found {len(results)} results using {req.method} retrieval.",
            "notes": [
                item.get("confidence_note", "")
                for item in results
                if item.get("confidence_note")
            ],
        }
    except Exception as exc:
        logger.exception("Search explanation failed")
        return {
            "query": query,
            "query_type": "semantic",
            "detected_specs": {},
            "explanation": f"Search explanation endpoint is connected, but explanation failed: {exc}",
            "notes": [],
        }


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

@app.get("/documents")
def documents():
    chunks = _load_chunks()
    chunks_by_file = Counter(item.get("source_file", "") for item in chunks)
    evidence_map = _evidence_by_file()

    docs = []

    for pdf in _pdf_files():
        ev = evidence_map.get(pdf.name, evidence_map.get(pdf.stem, {}))
        chunk_count = chunks_by_file.get(pdf.name, 0)

        docs.append(
            {
                "filename": pdf.name,
                "size_bytes": pdf.stat().st_size,
                "parsed": bool((PARSED_DIR / f"{pdf.stem}.txt").exists())
                or bool((PARSED_DIR / "documents.json").exists()),
                "indexed": chunk_count > 0,
                "pdf_type": ev.get("pdf_type", "unknown") if isinstance(ev, dict) else "unknown",
                "num_pages": int(ev.get("page_count", 0) or 0) if isinstance(ev, dict) else 0,
                "num_chunks": int(chunk_count),
                "extraction_method": ev.get("extraction_method", "unknown")
                if isinstance(ev, dict)
                else "unknown",
            }
        )

    return {"count": len(docs), "documents": docs}


# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------

@app.post("/reset")
def reset():
    deleted = {}

    for folder in [PARSED_DIR, CHUNKS_DIR, INDEX_DIR, EVIDENCE_DIR]:
        count = 0
        for item in folder.glob("*"):
            if item.is_file():
                item.unlink()
                count += 1
            elif item.is_dir():
                shutil.rmtree(item)
                count += 1
        deleted[folder.name] = count

    try:
        import backend.app.services.retriever as retriever_mod

        retriever_mod._cached_index = None
        retriever_mod._cached_dense_embedder = None
    except Exception:
        pass

    result_file = EVAL_DIR / "results.json"
    if result_file.exists():
        result_file.unlink()
        deleted["eval_results"] = 1
    else:
        deleted["eval_results"] = 0

    return {"message": "Reset complete. Raw PDFs preserved.", "deleted": deleted}


# ---------------------------------------------------------------------------
# Evidence
# ---------------------------------------------------------------------------

@app.get("/evidence")
def evidence_list():
    reports = []
    evidence_map = _evidence_by_file()

    for pdf in _pdf_files():
        ev = evidence_map.get(pdf.name, evidence_map.get(pdf.stem))

        if isinstance(ev, dict):
            reports.append(ev)
            continue

        reports.append(
            {
                "file": pdf.name,
                "pdf_type": "unknown",
                "confidence": 0.0,
                "page_count": 0,
                "diagnostics": {},
                "extraction_method": "unknown",
                "tables_detected": 0,
                "chunks_created": 0,
                "indexed_chunks": 0,
                "excluded_chunks": 0,
                "sample_text": "",
                "warnings": ["Evidence not available — run ingestion first."],
            }
        )

    return {"reports": reports}


@app.get("/evidence/{filename}")
def evidence_detail(filename: str):
    pdf = RAW_DIR / Path(filename).name

    if not pdf.exists():
        raise HTTPException(status_code=404, detail="File not found")

    evidence_map = _evidence_by_file()
    ev = evidence_map.get(pdf.name, evidence_map.get(pdf.stem))

    if isinstance(ev, dict):
        return ev

    return {
        "file": pdf.name,
        "pdf_type": "unknown",
        "confidence": 0.0,
        "diagnostics": {},
        "sample_text": "",
        "warnings": ["Detailed evidence not available — run ingestion first."],
    }


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

@app.post("/evaluation/run")
def evaluation_run():
    try:
        from backend.scripts.evaluate import run_evaluation

        result = run_evaluation()
        return result
    except Exception as exc:
        logger.warning("Service-layer evaluation failed: %s", exc)

        result = {
            "message": f"Evaluation endpoint connected. Error: {exc}",
            "metrics": {},
            "results": [],
        }

        (EVAL_DIR / "results.json").write_text(
            json.dumps(result, indent=2),
            encoding="utf-8",
        )
        return result


@app.get("/evaluation/results")
def evaluation_results():
    result_file = EVAL_DIR / "results.json"

    if result_file.exists():
        return json.loads(result_file.read_text(encoding="utf-8"))

    return {"message": "No evaluation results yet.", "metrics": {}, "results": []}


# ---------------------------------------------------------------------------
# Report export
# ---------------------------------------------------------------------------

@app.post("/report/export")
def export_report():
    report = ROOT / "EVALUATION_REPORT.md"
    result_file = EVAL_DIR / "results.json"

    content = "# Parspec Evaluation Report\n\n"

    if result_file.exists():
        try:
            data = json.loads(result_file.read_text(encoding="utf-8"))
            metrics = data.get("metrics", {})

            content += "## Metrics\n\n"
            if metrics:
                for key, value in metrics.items():
                    content += f"- **{key}**: {value}\n"
            else:
                content += "- No metrics available.\n"

            content += "\n## Query Results\n\n"
            for result in data.get("results", []):
                status = "✅" if result.get("pass") else "❌"
                content += (
                    f"- {status} `{result.get('query', '')}` → "
                    f"{result.get('actual_top_file', '—')} "
                    f"(rank {result.get('rank', '—')})\n"
                )
        except Exception as exc:
            content += f"Report export endpoint is connected, but reading metrics failed: {exc}\n"
    else:
        content += "No evaluation results yet. Run evaluation first.\n"

    report.write_text(content, encoding="utf-8")

    return {"message": "Report exported", "path": str(report)}