#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
./clear_data.sh
if [ -f backend/scripts/create_sample_pdfs.py ]; then
  echo "Creating sample PDFs..."
  python3 backend/scripts/create_sample_pdfs.py
fi
if [ -f backend/scripts/build_index.py ]; then
  echo "Building index..."
  python3 backend/scripts/build_index.py
fi
python3 -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
