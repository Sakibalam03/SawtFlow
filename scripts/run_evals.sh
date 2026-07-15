#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
conda run -n infinia-eval python src/evaluate.py "$@"
conda run -n infinia-eval python src/make_listening_sheet.py "$@"
conda run -n infinia-eval python src/aggregate_results.py "$@"

