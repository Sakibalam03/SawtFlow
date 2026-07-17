"""Minimum artifact and linkage validator; it does not assess subjective audio quality."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_PATHS = [
    "README.md", "PROJECT.md", "RUNBOOK_24H.md", "configs/benchmark.yaml", "data/prompts.csv",
    "data/references/reference.wav", "data/references/CONSENT_OR_SOURCE.md", "outputs/raw/benchmark.jsonl",
    "outputs/eval/objective_metrics.csv", "outputs/eval/results_summary.csv", "report/REPORT.md",
]


def rows(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def main() -> int:
    errors: list[str] = []
    for relative in REQUIRED_PATHS:
        if not (ROOT / relative).is_file():
            errors.append(f"Missing required file: {relative}")
    raw_path = ROOT / "outputs/raw/benchmark.jsonl"
    objective_path = ROOT / "outputs/eval/objective_metrics.csv"
    if raw_path.is_file():
        raw = rows(raw_path)
        required_fields = {"run_id", "model", "language", "audio_path", "status", "ttfa_s", "ttfa_mode", "is_warmup"}
        for index, row in enumerate(raw, start=1):
            missing = required_fields - set(row)
            if missing:
                errors.append(f"Raw row {index} lacks: {', '.join(sorted(missing))}")
            if row.get("ttfa_s") is not None and row.get("ttfa_mode") == "not_measured_batch_api":
                errors.append(f"Raw row {index} has incompatible batch TTFA fields")
            if row.get("status") == "ok" and not (ROOT / row["audio_path"]).is_file():
                errors.append(f"Raw row {index} references missing WAV: {row['audio_path']}")
        successful = {row["run_id"] for row in raw if row.get("status") == "ok" and not row.get("is_warmup")}
        if successful and objective_path.is_file():
            with objective_path.open("r", encoding="utf-8", newline="") as handle:
                metric_runs = {row["run_id"] for row in csv.DictReader(handle) if row.get("status") == "ok"}
            missing_metrics = successful - metric_runs
            if missing_metrics:
                errors.append(f"Successful runs missing objective metrics: {len(missing_metrics)}")
    if errors:
        print("VALIDATION FAILED")
        print("\n".join(f"- {error}" for error in errors))
        return 1
    print("VALIDATION PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
