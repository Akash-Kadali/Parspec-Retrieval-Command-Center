# Parspec Retrieval Command Center

A full-stack retrieval system for searching manufacturer product datasheets using natural language queries.

This project was built to handle real PDF documents that are not always clean or uniform. Some files have multi-column layouts, some are table-heavy, and some may need OCR support. The idea was to build a practical pipeline that can ingest such PDFs, index them properly, and return the most relevant section for a user query.

## Snapshot

![System Status](screenshots/1.png)

The application includes:
- PDF ingestion and parsing
- OCR-aware extraction
- Multi-column and table-aware chunking
- Hybrid retrieval
- Confidence-aware ranking
- Query evaluation
- Evidence and diagnostics pages

## Why I built it this way

For this task, I wanted the system to be more than a simple keyword search demo. My focus was on building an end-to-end workflow that starts from raw PDFs and goes up to retrieval, evidence, and evaluation.

A lot of product datasheets are difficult to work with because the content is not arranged like clean plain text. Because of that, I treated document understanding as an important part of retrieval itself. The system first tries to extract text normally, falls back to OCR when needed, preserves layout order for multi-column pages, and then builds chunks that are more suitable for search.

## Main idea

The system takes a natural-language product query and tries to return the most relevant document section from the indexed PDF collection.

Some example query styles it is designed to support are:
- spec-heavy queries
- rough product descriptions
- exact model-number lookups
- comparable-product style searches
- no-match cases

## Architecture

### Backend
- FastAPI
- PDF ingestion and parsing
- OCR fallback
- Section-aware and table-aware chunking
- Sparse and dense retrieval
- Reranking
- Evaluation pipeline

### Frontend
- React + Vite
- Search page
- Documents page
- Evidence page
- Evaluation dashboard
- Settings page

## Application pages

### 1. System status and runtime support

This page gives a quick view of the running system, including backend connection, indexed chunks, and enabled retrieval components.

![System Settings](screenshots/1.png)

### 2. Submission and run commands

I also kept the execution steps visible in the app so the workflow is easier to reproduce and verify.

![Commands and Diagnostics](screenshots/2.png)

### 3. Document ingestion view

The documents page shows parsing status, indexing status, PDF type, chunk counts, and extraction method for each file.

![Documents Page](screenshots/3.png)

## Workflow

The overall flow is:

1. Upload or load the manufacturer PDFs
2. Parse each document
3. Apply OCR if text extraction is weak
4. Detect multi-column structure where needed
5. Create section-aware and table-aware chunks
6. Build sparse and dense indexes
7. Accept a natural-language user query
8. Retrieve and rerank results
9. Show results with confidence and evidence
10. Run evaluation on sample queries

## Retrieval approach

The final ranking is based on a combination of lexical, semantic, and rule-based signals.

In simple terms, the score combines:
- hybrid retrieval score
- exact model-number boosts
- numeric specification matches
- finish or material matches
- section relevance
- weak-match penalties

This makes the retrieval less dependent on a single signal and more aligned with how product datasheets are actually searched.

## Project structure

```bash
parspec-retrieval-command-center/
│
├── backend/
│   ├── app/
│   ├── data/
│   ├── eval/
│   ├── tests/
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── screenshots/
│   ├── 1.png
│   ├── 2.png
│   └── 3.png
│
├── README.md
└── report.tex
````

## How to run

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Local URLs

* Frontend: `http://localhost:5173`
* Backend: `http://localhost:8000`

## What I tried to emphasise

While building this, I mainly focused on three things:

* making the retrieval pipeline work end to end
* handling difficult PDF layouts in a more careful way
* keeping the system inspectable through evidence and evaluation views

So the project is not only about returning a result, but also about showing how that result was produced and how the system behaves across different query types.

## Scope for improvement

There is still room to improve a few parts further, especially:

* section-level localisation
* OCR handling on very low-quality scans
* larger corpus support
* stronger comparable-product matching
* richer metadata extraction

## Author

**Sri Akash Kadali**
