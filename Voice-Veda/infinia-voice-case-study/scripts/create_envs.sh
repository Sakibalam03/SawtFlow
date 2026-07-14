#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

for environment in chatterbox xtts indicf5 eval; do
  conda env create --file "envs/${environment}.yml" --force
done

