#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
name="${1:?pass an environment suffix, for example chatterbox}"
mkdir -p evidence
{
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  uname -a || true
  python --version
  nvidia-smi || true
} > "evidence/system_info_${name}.txt"
pip freeze > "evidence/pip-freeze_${name}.txt"

