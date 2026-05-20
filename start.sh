#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }; }
need python
need npm

if [ ! -d frontend/node_modules ]; then
  echo "frontend/node_modules missing. Installing frontend deps..."
  (cd frontend && npm install)
fi

python - <<'PY'
try:
    import fastapi, uvicorn, fitz, pdfplumber, sklearn
except Exception as e:
    raise SystemExit(f"Python dependency missing: {e}\nRun: pip install -r requirements.txt")
PY

mkdir -p data/raw data/parsed data/chunks data/index data/evidence eval

echo "Starting backend: http://127.0.0.1:8000"
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

echo "Starting frontend: http://localhost:5173"
(cd frontend && npm run dev -- --host 127.0.0.1 --port 5173) &
FRONTEND_PID=$!

cleanup() {
  echo "Stopping services..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "URLs:"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://127.0.0.1:8000/docs"
wait
