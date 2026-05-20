# Parspec Datasheet Retrieval — Submission-Ready App

Full-stack retrieval system for product datasheets across Mechanical, Plumbing, Lighting/Electrical, and HVAC-like samples.

## Features

- FastAPI backend and React/Vite frontend
- PDF upload, ingestion, chunking, indexing, and search
- PyMuPDF + pdfplumber extraction
- OCR path for scanned/image-only PDFs with Tesseract/Poppler diagnostics
- Multi-column detection and column-aware extraction
- Table-aware row-atomic chunks preserving headers on every row
- Spec/entity extraction for model numbers, manufacturer, domain, material, finish, dimensions, CFM, GPM, lumens, watts, voltage, CCT, CRI, LPW, PSI, BTU, dB, certifications, and dimming
- Hybrid retrieval: BM25 + TF-IDF + optional dense embeddings with RRF fusion
- Exact model-number search and comparable-product mode
- Explainability API and frontend “Why this matched” cards
- Evidence page and evaluation dashboard
- One-command scripts and Docker support

## Quick Start

```bash
pip install -r requirements.txt
cd frontend && npm install && cd ..
python backend/scripts/create_sample_pdfs.py
python backend/scripts/build_index.py
./start.sh
```

Open:

- Frontend: http://localhost:5173
- Backend docs: http://127.0.0.1:8000/docs

## Reset and Run Backend Only

```bash
./reset_and_run.sh
```

## Docker

```bash
docker compose up --build
```

## Tests and Evaluation

```bash
python -m pytest tests -v
python backend/scripts/evaluate.py
```

## Demo Flow

1. Run `./start.sh`.
2. Open http://localhost:5173.
3. Show Settings status: backend, OCR, BM25, dense, index.
4. Create sample PDFs or upload your own.
5. Click Build / Refresh Index.
6. Open Documents and Evidence pages.
7. Search: `6" recessed downlight, 3000K, black trim, dimmable`.
8. Search: `KBF514`.
9. Search: `Karran KBF514 find comparable products`.
10. Search: `industrial boiler 500 PSI steam` and show no/low-confidence behavior.
11. Run Evaluation Dashboard.
12. Export report.


## Testing with Real PDFs

The system can be tested against both synthetic PDFs and real-world manufacturer datasheets from the assignment.

```bash
# Download the 6 real PDFs referenced in the assignment
python backend/scripts/download_real_pdfs.py

# Rebuild index with the current embedding model
python backend/scripts/build_index.py

# Run evaluation against synthetic and real PDFs
python backend/scripts/evaluate.py --query-file eval/queries.json
python backend/scripts/evaluate.py --query-file eval/real_pdf_queries.json
```

### Real PDF Evaluation Results

| Metric | Synthetic PDFs | Real PDFs |
|--------|---------------|-----------|
| Top-1 Accuracy | Run eval | Run eval |
| Top-3 Accuracy | Run eval | Run eval |
| MRR | Run eval | Run eval |
| Section Accuracy | Run eval | Run eval |

Real-PDF accuracy may be lower than synthetic accuracy because manufacturer PDFs contain irregular layouts, merged table cells, embedded images, inconsistent catalog formatting, and OCR noise. The separate eval set makes that gap visible instead of hiding it behind clean generated samples.

## Known Limitations

See `FAILURE_CASES.md`.

## Scaling Plan

See `SCALING.md`.


