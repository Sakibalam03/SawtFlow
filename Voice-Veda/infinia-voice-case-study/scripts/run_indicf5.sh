#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
conda run -n infinia-indicf5 python src/run_indicf5.py "$@"

