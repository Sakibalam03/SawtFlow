#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
conda run -n infinia-chatterbox python src/run_chatterbox.py --variant mtl-v3 "$@"
conda run -n infinia-chatterbox python src/run_chatterbox.py --variant turbo "$@"

