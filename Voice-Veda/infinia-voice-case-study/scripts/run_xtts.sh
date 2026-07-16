#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
conda run -n infinia-xtts python src/run_xtts.py "$@"

