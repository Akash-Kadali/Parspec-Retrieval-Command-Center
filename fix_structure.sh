#!/usr/bin/env bash
# ============================================================================
# fix_structure.sh — Run from the project root (parspec_app/)
#
# This script fixes the folder structure so all Python imports resolve.
# It is SAFE to run multiple times (idempotent).
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "=== Fixing Parspec project structure ==="
echo "Working in: $ROOT"
echo ""

# ------------------------------------------------------------------
# 1. Create missing directories
# ------------------------------------------------------------------
echo "1. Creating missing directories..."
mkdir -p backend/app/models
mkdir -p backend/app/api
mkdir -p backend/app/services
mkdir -p backend/app/core

# ------------------------------------------------------------------
# 2. Create all required __init__.py files
# ------------------------------------------------------------------
echo "2. Creating __init__.py files..."
touch backend/__init__.py
touch backend/app/__init__.py
touch backend/app/core/__init__.py
touch backend/app/models/__init__.py
touch backend/app/api/__init__.py
touch backend/app/services/__init__.py

# ------------------------------------------------------------------
# 3. Move model files: services/ → models/
#    chunk.py and document.py are Pydantic models imported as:
#      from backend.app.models.chunk import ChunkData
#      from backend.app.models.document import DocumentData, PageData
# ------------------------------------------------------------------
echo "3. Moving model files to backend/app/models/..."

if [ -f backend/app/services/chunk.py ]; then
    mv backend/app/services/chunk.py backend/app/models/chunk.py
    echo "   Moved chunk.py → models/"
fi

if [ -f backend/app/services/document.py ]; then
    mv backend/app/services/document.py backend/app/models/document.py
    echo "   Moved document.py → models/"
fi

# Safety: if they already exist in models/, skip
if [ ! -f backend/app/models/chunk.py ]; then
    echo "   WARNING: backend/app/models/chunk.py not found!"
fi
if [ ! -f backend/app/models/document.py ]; then
    echo "   WARNING: backend/app/models/document.py not found!"
fi

# ------------------------------------------------------------------
# 4. Move API files: services/ → api/
#    routes.py and schemas.py are API-layer files imported as:
#      from backend.app.api.routes import router
#      from backend.app.api.schemas import SearchRequest, ...
# ------------------------------------------------------------------
echo "4. Moving API files to backend/app/api/..."

if [ -f backend/app/services/routes.py ]; then
    mv backend/app/services/routes.py backend/app/api/routes.py
    echo "   Moved routes.py → api/"
fi

if [ -f backend/app/services/schemas.py ]; then
    mv backend/app/services/schemas.py backend/app/api/schemas.py
    echo "   Moved schemas.py → api/"
fi

# ------------------------------------------------------------------
# 5. Fix main.py — the entry point that uvicorn uses
#    backend/app/main.py should import from backend.app.api.routes
#    Remove the duplicate in services/
# ------------------------------------------------------------------
echo "5. Fixing main.py..."

# Remove the duplicate main.py that ended up in services/
if [ -f backend/app/services/main.py ]; then
    rm backend/app/services/main.py
    echo "   Removed duplicate backend/app/services/main.py"
fi

# The real main.py should be at backend/app/main.py
# If backend/main.py exists and backend/app/main.py is outdated, the user
# should replace it. We just warn here.
if [ -f backend/main.py ]; then
    echo "   NOTE: backend/main.py exists (old location). The app uses backend/app/main.py."
    echo "   If backend/app/main.py is stale, copy the fixed version there."
fi

# ------------------------------------------------------------------
# 6. Remove duplicate/stale config.py in services/
# ------------------------------------------------------------------
echo "6. Cleaning up duplicates..."

if [ -f backend/app/services/config.py ]; then
    rm backend/app/services/config.py
    echo "   Removed duplicate backend/app/services/config.py (real one is in core/)"
fi

# Remove stale simple_index.json (from old broken inline ingest)
if [ -f data/index/simple_index.json ]; then
    rm data/index/simple_index.json
    echo "   Removed stale data/index/simple_index.json"
fi

# ------------------------------------------------------------------
# 7. Remove .DS_Store files (macOS junk)
# ------------------------------------------------------------------
echo "7. Removing .DS_Store files..."
find . -name ".DS_Store" -delete 2>/dev/null || true

# ------------------------------------------------------------------
# 8. Verify the structure
# ------------------------------------------------------------------
echo ""
echo "=== Verification ==="

ERRORS=0

check_file() {
    if [ ! -f "$1" ]; then
        echo "   MISSING: $1"
        ERRORS=$((ERRORS + 1))
    else
        echo "   OK: $1"
    fi
}

echo "Core:"
check_file "backend/app/core/config.py"
check_file "backend/app/core/__init__.py"

echo "Models:"
check_file "backend/app/models/__init__.py"
check_file "backend/app/models/chunk.py"
check_file "backend/app/models/document.py"

echo "API:"
check_file "backend/app/api/__init__.py"
check_file "backend/app/api/routes.py"
check_file "backend/app/api/schemas.py"

echo "Services:"
check_file "backend/app/services/__init__.py"
check_file "backend/app/services/parser.py"
check_file "backend/app/services/chunker.py"
check_file "backend/app/services/indexer.py"
check_file "backend/app/services/retriever.py"
check_file "backend/app/services/reranker.py"
check_file "backend/app/services/embedder.py"
check_file "backend/app/services/cross_encoder.py"
check_file "backend/app/services/spec_extractor.py"
check_file "backend/app/services/query_understanding.py"
check_file "backend/app/services/table_extractor.py"
check_file "backend/app/services/classifier.py"
check_file "backend/app/services/ocr.py"

echo "Entry point:"
check_file "backend/app/main.py"
check_file "backend/app/__init__.py"
check_file "backend/__init__.py"

echo "Scripts:"
check_file "backend/scripts/download_real_pdfs.py"
check_file "backend/scripts/evaluate.py"

echo "Eval:"
check_file "eval/queries.json"
check_file "eval/score_assignment.py"

echo "Tests:"
check_file "tests/test_real_pdfs.py"
check_file "tests/test_cross_encoder.py"

echo ""
if [ "$ERRORS" -gt 0 ]; then
    echo "⚠  $ERRORS file(s) missing — fix these before running."
else
    echo "✅ All files in place. Structure is correct."
fi

echo ""
echo "=== Final structure (key files) ==="
echo ""
echo "parspec_app/"
echo "├── backend/"
echo "│   ├── __init__.py"
echo "│   ├── app/"
echo "│   │   ├── __init__.py"
echo "│   │   ├── main.py              ← uvicorn entry point"
echo "│   │   ├── core/"
echo "│   │   │   ├── __init__.py"
echo "│   │   │   └── config.py         ← Settings (BGE model, cross-encoder, etc.)"
echo "│   │   ├── models/"
echo "│   │   │   ├── __init__.py"
echo "│   │   │   ├── chunk.py          ← ChunkData pydantic model"
echo "│   │   │   └── document.py       ← DocumentData, PageData models"
echo "│   │   ├── api/"
echo "│   │   │   ├── __init__.py"
echo "│   │   │   ├── routes.py         ← All FastAPI endpoints"
echo "│   │   │   └── schemas.py        ← Request/response pydantic models"
echo "│   │   └── services/"
echo "│   │       ├── __init__.py"
echo "│   │       ├── parser.py         ← PDF extraction (native/scanned/multi-col)"
echo "│   │       ├── chunker.py        ← Table-atomic + section-aware chunking"
echo "│   │       ├── indexer.py        ← Build TF-IDF + BM25 + dense index"
echo "│   │       ├── retriever.py      ← Hybrid search + model number + comparable"
echo "│   │       ├── reranker.py       ← Domain-aware boosting + RRF fusion"
echo "│   │       ├── embedder.py       ← Dense + TF-IDF + BM25 backends"
echo "│   │       ├── cross_encoder.py  ← Cross-encoder reranking"
echo "│   │       ├── spec_extractor.py ← Numeric specs + model numbers + manufacturer"
echo "│   │       ├── query_understanding.py ← Query classification + explain_match"
echo "│   │       ├── table_extractor.py     ← Row-atomic table serialization"
echo "│   │       ├── classifier.py     ← PDF type classifier"
echo "│   │       └── ocr.py            ← Tesseract OCR with fallbacks"
echo "│   └── scripts/"
echo "│       ├── download_real_pdfs.py"
echo "│       ├── evaluate.py"
echo "│       └── calibrate_reranker.py"
echo "├── eval/"
echo "│   ├── queries.json"
echo "│   └── score_assignment.py"
echo "├── tests/"
echo "│   ├── test_real_pdfs.py"
echo "│   └── test_cross_encoder.py"
echo "├── data/  (raw/, parsed/, chunks/, index/, evidence/)"
echo "├── frontend/ ..."
echo "├── ANSWERS.md"
echo "├── README.md"
echo "└── requirements.txt"
echo ""
echo "Done."
