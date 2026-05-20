#!/usr/bin/env bash
# ============================================================================
# run_all.sh — One command to set up and run the entire Parspec app
#
# Usage:  chmod +x run_all.sh && ./run_all.sh
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

cleanup() {
  echo ""
  echo "Stopping services..."
  kill "${BACKEND_PID:-}" "${FRONTEND_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "======================================"
echo " Parspec — Full Setup & Run"
echo "======================================"

# ------------------------------------------------------------------
# 0. Preflight checks
# ------------------------------------------------------------------
for cmd in python3 npm curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: $cmd not found. Install it first."; exit 1; }
done

[ -f requirements.txt ]       || { echo "ERROR: requirements.txt not found."; exit 1; }
[ -f frontend/package.json ]  || { echo "ERROR: frontend/package.json not found."; exit 1; }

# ------------------------------------------------------------------
# 1. Fix folder structure (idempotent)
# ------------------------------------------------------------------
echo ""
echo "[1/9] Fixing folder structure..."

mkdir -p backend/app/models backend/app/api backend/app/services backend/app/core
mkdir -p data/raw data/parsed data/chunks data/index data/evidence eval

touch backend/__init__.py backend/app/__init__.py
touch backend/app/core/__init__.py backend/app/models/__init__.py
touch backend/app/api/__init__.py backend/app/services/__init__.py

# Move misplaced files if they exist
[ -f backend/app/services/chunk.py ]    && mv backend/app/services/chunk.py    backend/app/models/chunk.py    2>/dev/null || true
[ -f backend/app/services/document.py ] && mv backend/app/services/document.py backend/app/models/document.py 2>/dev/null || true
[ -f backend/app/services/routes.py ]   && mv backend/app/services/routes.py   backend/app/api/routes.py      2>/dev/null || true
[ -f backend/app/services/schemas.py ]  && mv backend/app/services/schemas.py  backend/app/api/schemas.py     2>/dev/null || true

# Remove duplicates
rm -f backend/app/services/main.py backend/app/services/config.py
rm -f data/index/simple_index.json

# Clean macOS junk
find . -name ".DS_Store" -delete 2>/dev/null || true

echo "   Structure OK."

# ------------------------------------------------------------------
# 2. Create virtual environment
# ------------------------------------------------------------------
echo ""
echo "[2/9] Setting up Python virtual environment..."

if [ ! -d .venv ]; then
  python3 -m venv .venv
  echo "   Created .venv"
else
  echo "   .venv already exists"
fi

source .venv/bin/activate
export PYTHONPATH="$ROOT"

echo "   Python: $(python --version) at $(which python)"

# ------------------------------------------------------------------
# 3. Install backend dependencies
# ------------------------------------------------------------------
echo ""
echo "[3/9] Installing Python dependencies..."
pip install --upgrade pip setuptools wheel -q
pip install -r requirements.txt -q
echo "   Done."

# ------------------------------------------------------------------
# 4. Verify backend imports
# ------------------------------------------------------------------
echo ""
echo "[4/9] Verifying backend imports..."
python -c "
from backend.app.main import app
from backend.app.services.indexer import ingest_all_pdfs
from backend.app.services.retriever import search_chunks
from backend.app.services.query_understanding import classify_query
print('   All imports OK.')
"

# ------------------------------------------------------------------
# 5. Install frontend dependencies
# ------------------------------------------------------------------
echo ""
echo "[5/9] Installing frontend dependencies..."
if [ ! -d frontend/node_modules ]; then
  (cd frontend && npm install --silent)
  echo "   Done."
else
  echo "   node_modules exists, skipping."
fi

# ------------------------------------------------------------------
# 6. Download real PDFs
# ------------------------------------------------------------------
echo ""
echo "[6/9] Downloading real PDFs..."
python backend/scripts/download_real_pdfs.py

# ------------------------------------------------------------------
# 7. Build index (ingest PDFs)
# ------------------------------------------------------------------
echo ""
echo "[7/9] Building index (parse → chunk → embed → index)..."
python -c "
from backend.app.services.indexer import ingest_all_pdfs
stats = ingest_all_pdfs()
print(f'   {stats[\"num_pdfs\"]} PDFs → {stats[\"num_chunks\"]} chunks ({stats[\"num_indexed\"]} indexed)')
print(f'   Dense: {stats[\"dense_available\"]}, BM25: {stats[\"bm25_available\"]}')
"

# ------------------------------------------------------------------
# 8. Run tests
# ------------------------------------------------------------------
echo ""
echo "[8/9] Running tests..."
python -m pytest tests -q --tb=short 2>&1 || echo "   Some tests failed (non-blocking)."

# ------------------------------------------------------------------
# 9. Start backend + frontend
# ------------------------------------------------------------------
echo ""
echo "[9/9] Starting servers..."

PYTHONPATH="$ROOT" python -m uvicorn backend.app.main:app \
  --host 127.0.0.1 --port 8000 --log-level info &
BACKEND_PID=$!

sleep 3

# Health check
if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
  echo "   Backend health OK."
else
  echo "   WARNING: Backend health check failed."
fi

(cd frontend && npm run dev -- --host 127.0.0.1 --port 5173) &
FRONTEND_PID=$!

sleep 2

echo ""
echo "======================================"
echo "  App is running!"
echo ""
echo "  Frontend:  http://localhost:5173"
echo "  Backend:   http://127.0.0.1:8000/docs"
echo "  Health:    http://127.0.0.1:8000/health"
echo ""
echo "  Press Ctrl+C to stop."
echo "======================================"

wait