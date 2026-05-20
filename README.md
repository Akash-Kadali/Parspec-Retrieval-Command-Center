# Parspec Retrieval Command Center

AI-powered product datasheet retrieval system for manufacturer PDFs.

This project is a full-stack application developed to retrieve the most relevant product datasheet sections from real manufacturer PDF documents. It is designed to handle practical PDF challenges such as multi-column layouts, table-heavy content, and OCR fallback, while also providing transparent evaluation and evidence views.

## Overview

The system takes a natural-language product query and returns the most relevant document section from the indexed PDF corpus.

It supports:

- PDF ingestion
- OCR-aware extraction
- Multi-column parsing
- Table-aware chunking
- Hybrid retrieval
- Confidence-aware ranking
- Query evaluation
- Evidence inspection
- Report export

The project includes a FastAPI backend and a React/Vite frontend.

## Features

### Backend
- PDF parsing and document ingestion
- OCR fallback for weak or scanned text extraction
- Multi-column layout handling
- Section-aware and table-aware chunking
- Hybrid retrieval using sparse and dense methods
- Exact model-number matching support
- Reranking for improved result quality
- Evaluation pipeline for retrieval performance

### Frontend
- Search interface for natural-language queries
- Documents page for ingestion and indexing status
- Evidence page for extraction diagnostics
- Evaluation dashboard with metrics and query-level results
- Settings page showing runtime capabilities and system status

## Project Structure

```bash
parspec-retrieval-command-center/
│
├── backend/                  # FastAPI backend
│   ├── app/                  # API routes and backend logic
│   ├── data/                 # PDFs, chunks, indexes, outputs
│   ├── eval/                 # Evaluation queries and outputs
│   ├── tests/                # Backend tests
│   └── requirements.txt
│
├── frontend/                 # React + Vite frontend
│   ├── src/
│   ├── public/
│   └── package.json
│
├── screenshots/              # UI screenshots used for report
├── README.md
└── report.tex                # LaTeX write-up / submission report
````

## System Workflow

1. User uploads manufacturer datasheet PDFs.
2. Backend stores the raw documents.
3. Parser attempts normal text extraction.
4. If extraction is weak, OCR is used as fallback.
5. Multi-column layout detection preserves reading order.
6. The system creates section-aware and table-aware chunks.
7. Important structured specifications are extracted.
8. Sparse and dense indexes are built.
9. User submits a natural-language query.
10. Hybrid retrieval and reranking are applied.
11. Frontend displays ranked results with confidence and explanation.
12. Evaluation can be run to measure retrieval quality and latency.

## Retrieval Logic

The ranking combines lexical, semantic, and rule-based signals.

A simplified scoring idea is:

```math
S_final = S_hybrid + B_model + B_numeric + B_finish + B_section - P_weak
```

Where:

* `S_hybrid` = combined sparse and dense retrieval score
* `B_model` = boost for exact model-number match
* `B_numeric` = boost for matching numeric specifications
* `B_finish` = boost for matching material or finish terms
* `B_section` = boost for relevant section type
* `P_weak` = penalty for weak or unrelated matches

## Example Query Types Supported

The application is designed to support:

* Spec-heavy queries
  Example: `6" recessed downlight, 3000K, black trim, dimmable`

* Rough product descriptions
  Example: `stainless kitchen sink single bowl undermount`

* Exact model-number queries
  Example: `KBF514`

* Comparable-product queries

* OCR/scanned PDF cases

* Multi-column and table-heavy datasheets

* No-match queries

## Evaluation Metrics

The evaluation dashboard reports:

* Top-1 Accuracy
* Top-3 Accuracy
* Section Accuracy
* Mean Reciprocal Rank (MRR)
* No-Match Accuracy
* Average Latency
* Query-level result details

This helps verify not only overall performance, but also how the system behaves for individual queries.

## How to Run

## 1. Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Run backend:

```bash
uvicorn app.main:app --reload
```

## 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

## 3. Open Application

Frontend usually runs at:

```bash
http://localhost:5173
```

Backend usually runs at:

```bash
http://localhost:8000
```

## Suggested Submission Flow

A typical run can follow this order:

1. Start backend
2. Start frontend
3. Upload or load PDFs
4. Build the retrieval index
5. Run sample queries
6. Inspect extraction evidence
7. Run evaluation
8. Export results if required

## Notes

* The system is built to demonstrate an end-to-end retrieval pipeline rather than only an isolated model.
* The focus is on practical document retrieval for real PDF layouts.
* The Evidence and Evaluation pages are included to make the pipeline more transparent and easier to inspect.

## Tech Stack

### Backend

* Python
* FastAPI
* OCR tools
* Sparse retrieval
* Dense retrieval
* Reranking pipeline

### Frontend

* React
* Vite
* TypeScript

## Future Improvements

Possible next improvements include:

* Better section-level localisation
* Larger PDF corpus support
* Improved OCR handling for low-quality scans
* Stronger metadata extraction
* Better comparable-product reasoning
* More detailed export and reporting support

## Author

**Sri Akash Kadali**

## Purpose

This project was developed as part of a take-home assignment to demonstrate a practical approach for AI-powered datasheet retrieval across manufacturer PDFs.
