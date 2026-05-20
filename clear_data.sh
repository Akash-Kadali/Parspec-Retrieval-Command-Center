#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "Clearing backend data..."
rm -rf data/parsed/*
rm -rf data/chunks/*
rm -rf data/index/*
rm -rf data/evidence/*
rm -rf eval/results.json
rm -rf EVALUATION_REPORT.md
rm -rf EVALUATION_REPORT.pdf

echo "Clearing Python cache..."
find . -type d -name "__pycache__" -prune -exec rm -rf {} +
find . -type f -name "*.pyc" -delete
find . -type f -name "*.pyo" -delete
find . -type d -name ".pytest_cache" -prune -exec rm -rf {} +
find . -type d -name ".mypy_cache" -prune -exec rm -rf {} +
find . -type d -name ".ruff_cache" -prune -exec rm -rf {} +

echo "Clearing frontend cache..."
rm -rf frontend/dist
rm -rf frontend/.vite
rm -rf frontend/node_modules/.vite
rm -rf frontend/.cache

echo "Clearing OS junk..."
find . -type f -name ".DS_Store" -delete

echo "Recreating folders..."
mkdir -p data/raw
mkdir -p data/parsed
mkdir -p data/chunks
mkdir -p data/index
mkdir -p data/evidence
mkdir -p eval

echo "Done. Raw PDFs are preserved in data/raw."