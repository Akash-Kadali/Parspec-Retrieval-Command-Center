"""Enhanced indexer — builds TF-IDF + BM25 + optional dense index with evidence collection."""

from __future__ import annotations

import json
import pickle
import logging
from pathlib import Path
from typing import List, Dict, Any

from backend.app.core.config import settings
from backend.app.models.chunk import ChunkData
from backend.app.services.chunker import chunk_document
from backend.app.services.embedder import DenseEmbedder, TfidfEmbedder, BM25Index
from backend.app.services.parser import parse_pdf, collect_evidence

logger = logging.getLogger(__name__)


def ensure_dirs() -> None:
    for directory in [
        settings.raw_dir,
        settings.parsed_dir,
        settings.chunks_dir,
        settings.index_dir,
        settings.evidence_dir,
    ]:
        Path(directory).mkdir(parents=True, exist_ok=True)


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text or "", encoding="utf-8")


def _chunk_to_dict(chunk: ChunkData) -> Dict[str, Any]:
    data = chunk.model_dump()

    # Keep a stable searchable text field for downstream scripts/UI.
    data.setdefault("text", data.get("chunk_text", ""))

    # Make sure fields exist even if older model versions omit them.
    data.setdefault("score", 0.0)
    data.setdefault("retrieval_method", "")
    data.setdefault("matched_fields", [])
    data.setdefault("matched_specs", {})
    data.setdefault("missing_specs", {})
    data.setdefault("why_matched", [])
    data.setdefault("confidence_note", "")
    data.setdefault("confidence_label", "")
    data.setdefault("above_threshold", False)
    data.setdefault("search_mode", "standard")
    data.setdefault("exact_match", False)
    data.setdefault("comparable_search", False)
    data.setdefault("comparable_reason", "")

    return data


def _normalize_evidence_report(report: Dict[str, Any], doc_data: Dict[str, Any], chunks: List[ChunkData]) -> Dict[str, Any]:
    source_file = doc_data.get("source_file", report.get("file", report.get("filename", "")))

    doc_chunks = [
        chunk for chunk in chunks
        if chunk.source_file == source_file
    ]

    indexed_chunks = [
        chunk for chunk in doc_chunks
        if not chunk.metadata.get("excluded", False)
    ]

    excluded_chunks = len(doc_chunks) - len(indexed_chunks)

    pdf_type = doc_data.get("pdf_type") or report.get("pdf_type", "unknown")
    confidence = doc_data.get("pdf_confidence", report.get("confidence", 0.0))

    diagnostics = report.get("diagnostics", {})
    if not isinstance(diagnostics, dict):
        diagnostics = {}

    # Preserve parser diagnostics from DocumentData as the source of truth.
    doc_diagnostics = doc_data.get("diagnostics", {})
    if isinstance(doc_diagnostics, dict):
        diagnostics = {**diagnostics, **doc_diagnostics}

    extraction_methods = doc_data.get("metadata", {}).get("extraction_methods", [])
    if not extraction_methods:
        extraction_method = report.get("extraction_method", "unknown")
    elif "column_aware" in extraction_methods:
        extraction_method = "column_aware"
    elif any(str(method).startswith("ocr") for method in extraction_methods):
        extraction_method = "ocr"
    else:
        extraction_method = extraction_methods[0]

    page_count = (
        report.get("page_count")
        or doc_data.get("metadata", {}).get("num_pages")
        or len(doc_data.get("pages", []))
        or 0
    )

    tables_detected = report.get("tables_detected", 0)
    if not tables_detected:
        try:
            tables_detected = sum(
                len(page.get("tables", []) or [])
                for page in doc_data.get("pages", [])
            )
        except Exception:
            tables_detected = 0

    sample_text = report.get("sample_text", "")
    if not sample_text:
        pages = doc_data.get("pages", [])
        if pages:
            sample_text = str(pages[0].get("text", ""))[:500]

    warnings = report.get("warnings", [])
    if not isinstance(warnings, list):
        warnings = [str(warnings)]

    if pdf_type == "multi_col" and not any("Column-aware" in str(w) for w in warnings):
        warnings.append("Column-aware extraction used for multi-column/layout-heavy PDF.")

    return {
        "file": source_file,
        "filename": source_file,
        "pdf_type": pdf_type,
        "confidence": float(confidence or 0.0),
        "page_count": int(page_count or 0),
        "diagnostics": diagnostics,
        "extraction_method": extraction_method,
        "tables_detected": int(tables_detected or 0),
        "chunks_created": len(doc_chunks),
        "indexed_chunks": len(indexed_chunks),
        "excluded_chunks": excluded_chunks,
        "sample_text": sample_text,
        "warnings": warnings,
        "page_tokens": report.get("page_tokens", []),
        "comparison": report.get("comparison", {}),
        "layout": report.get("layout", diagnostics.get("layout_diagnostics", {})),
        "pymupdf_preview": report.get("pymupdf_preview", ""),
        "pdfplumber_preview": report.get("pdfplumber_preview", ""),
    }


def _save_evidence_reports(evidence_reports: List[Dict[str, Any]]) -> None:
    evidence_dir = Path(settings.evidence_dir)
    evidence_dir.mkdir(parents=True, exist_ok=True)

    combined_file = evidence_dir / "extraction_evidence.json"
    _write_json(combined_file, evidence_reports)

    # Also save per-file evidence so /evidence/{filename} and debugging are easier.
    for report in evidence_reports:
        filename = report.get("file") or report.get("filename")
        if not filename:
            continue

        stem = Path(str(filename)).stem
        _write_json(evidence_dir / f"{stem}.json", report)


def _save_parsed_text_files(parsed_docs: List[Dict[str, Any]]) -> None:
    parsed_dir = Path(settings.parsed_dir)
    parsed_dir.mkdir(parents=True, exist_ok=True)

    for doc in parsed_docs:
        source_file = doc.get("source_file", "")
        if not source_file:
            continue

        stem = Path(source_file).stem
        pages = doc.get("pages", [])

        text_parts = []
        for page in pages:
            page_number = page.get("page_number", "")
            text = page.get("text", "")
            text_parts.append(f"\n\n===== PAGE {page_number} =====\n{text}")

        _write_text(parsed_dir / f"{stem}.txt", "\n".join(text_parts).strip())


def _build_index_payload(indexable_chunks: List[ChunkData]) -> Dict[str, Any]:
    texts = [chunk.chunk_text for chunk in indexable_chunks]

    dense_embedder = DenseEmbedder()
    dense_matrix = None

    if dense_embedder.available and texts:
        logger.info("Building dense embeddings for %d chunks...", len(texts))
        dense_matrix = dense_embedder.encode(texts, is_query=False)

    tfidf_embedder = TfidfEmbedder()
    tfidf_matrix = tfidf_embedder.fit_transform(texts) if texts else None

    bm25_index = BM25Index()
    if texts:
        bm25_index.build(texts)

    return {
        "dense_matrix": dense_matrix,
        "tfidf_vectorizer": tfidf_embedder.get_state(),
        "tfidf_matrix": tfidf_matrix,
        "bm25_index": bm25_index,
        "chunks": [_chunk_to_dict(chunk) for chunk in indexable_chunks],
        "dense_model": settings.embedding_model,
        "num_chunks": len(indexable_chunks),
    }


def ingest_all_pdfs() -> dict:
    ensure_dirs()

    raw_path = Path(settings.raw_dir)
    pdf_files = sorted(raw_path.glob("*.pdf"))

    if not pdf_files:
        return {
            "num_pdfs": 0,
            "num_chunks": 0,
            "num_indexed": 0,
            "num_excluded": 0,
            "dense_available": False,
            "bm25_available": False,
            "pdf_types": {},
            "message": "No PDFs found in data/raw/. Upload PDFs first.",
        }

    all_chunks: List[ChunkData] = []
    parsed_docs: List[Dict[str, Any]] = []
    raw_evidence_by_file: Dict[str, Dict[str, Any]] = {}

    for pdf_file in pdf_files:
        logger.info("Processing PDF: %s", pdf_file.name)

        try:
            doc = parse_pdf(str(pdf_file))
        except Exception as exc:
            logger.exception("Failed to parse %s", pdf_file.name)
            continue

        doc_data = doc.model_dump()
        parsed_docs.append(doc_data)

        doc_chunks = chunk_document(doc)
        all_chunks.extend(doc_chunks)

        try:
            raw_evidence_by_file[pdf_file.name] = collect_evidence(str(pdf_file))
        except Exception as exc:
            logger.warning("Evidence collection failed for %s: %s", pdf_file.name, exc)
            raw_evidence_by_file[pdf_file.name] = {
                "file": pdf_file.name,
                "pdf_type": doc.pdf_type,
                "confidence": doc.pdf_confidence,
                "page_count": len(doc.pages),
                "diagnostics": doc.diagnostics,
                "extraction_method": "unknown",
                "tables_detected": 0,
                "sample_text": doc.pages[0].text[:500] if doc.pages else "",
                "warnings": [f"Evidence collection failed: {exc}"],
            }

    if not parsed_docs:
        return {
            "num_pdfs": len(pdf_files),
            "num_chunks": 0,
            "num_indexed": 0,
            "num_excluded": 0,
            "dense_available": False,
            "bm25_available": False,
            "pdf_types": {},
            "message": "No PDFs could be parsed.",
        }

    parsed_file = Path(settings.parsed_dir) / "documents.json"
    _write_json(parsed_file, parsed_docs)
    _save_parsed_text_files(parsed_docs)

    chunk_dicts = [_chunk_to_dict(chunk) for chunk in all_chunks]
    chunks_file = Path(settings.chunks_dir) / "chunks.json"
    _write_json(chunks_file, chunk_dicts)

    indexable_chunks = [
        chunk for chunk in all_chunks
        if not chunk.metadata.get("excluded", False)
    ]

    num_excluded = len(all_chunks) - len(indexable_chunks)

    logger.info(
        "Total chunks: %d, Indexable: %d, Excluded: %d",
        len(all_chunks),
        len(indexable_chunks),
        num_excluded,
    )

    payload = _build_index_payload(indexable_chunks)

    index_file = Path(settings.index_dir) / "hybrid_index.pkl"
    index_file.parent.mkdir(parents=True, exist_ok=True)

    with open(index_file, "wb") as file:
        pickle.dump(payload, file)

    evidence_reports: List[Dict[str, Any]] = []
    chunks_for_evidence = all_chunks

    for doc_data in parsed_docs:
        source_file = doc_data.get("source_file", "")
        raw_report = raw_evidence_by_file.get(source_file, {})
        evidence_reports.append(
            _normalize_evidence_report(raw_report, doc_data, chunks_for_evidence)
        )

    _save_evidence_reports(evidence_reports)

    pdf_types: Dict[str, int] = {}
    for doc_data in parsed_docs:
        pdf_type = doc_data.get("pdf_type", "unknown")
        pdf_types[pdf_type] = pdf_types.get(pdf_type, 0) + 1

    stats = {
        "num_pdfs": len(parsed_docs),
        "num_chunks": len(all_chunks),
        "num_indexed": len(indexable_chunks),
        "num_excluded": num_excluded,
        "index_file": str(index_file),
        "dense_available": payload.get("dense_matrix") is not None,
        "bm25_available": bool(payload.get("bm25_index") and payload["bm25_index"].available),
        "pdf_types": pdf_types,
        "evidence_file": str(Path(settings.evidence_dir) / "extraction_evidence.json"),
        "message": "Ingest complete.",
    }

    return stats