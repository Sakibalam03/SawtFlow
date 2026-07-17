"""Create blinded absolute and paired A/B listener sheets without fabricating ratings."""

from __future__ import annotations

import argparse
import csv
import json
import random
from collections import defaultdict
from pathlib import Path

from common import ROOT, load_config, resolve_path


CANDIDATES = {
    "en": ("chatterbox-multilingual-v3", "chatterbox-turbo"),
    "ar": ("chatterbox-multilingual-v3", "xtts-v2"),
    "hi": ("chatterbox-multilingual-v3", "indicf5"),
}


def measured_rows(raw_path: Path) -> list[dict]:
    with raw_path.open("r", encoding="utf-8") as handle:
        rows = [json.loads(line) for line in handle if line.strip()]
    return [row for row in rows if row.get("status") == "ok" and not row.get("is_warmup") and row.get("repetition") == 1]


def write_csv(path: Path, fields: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def make_sheets(config_path: str) -> None:
    config = load_config(config_path)
    output_root = resolve_path(config["output_root"])
    rows = measured_rows(output_root / "raw/benchmark.jsonl")
    if not rows:
        raise RuntimeError("No successful first-repetition measured rows are available for listening sheets")
    rng = random.Random(config["listening"]["random_seed"])
    rng.shuffle(rows)
    reference = str(config["reference_audio"]).replace("\\", "/")
    absolute, absolute_key = [], []
    for index, row in enumerate(rows, start=1):
        blind_id = f"clip-{index:03d}"
        absolute.append({
            "blind_id": blind_id, "language": row["language"], "input_text": row["text"],
            "audio_path": row["audio_path"], "reference_audio_path": reference, "listener_id": "",
            "naturalness_1_to_5": "", "same_speaker_1_to_5": "", "pronunciation_1_to_5": "", "comments": "",
        })
        absolute_key.append({"blind_id": blind_id, "run_id": row["run_id"], "model": row["model"], "prompt_id": row["prompt_id"]})
    write_csv(output_root / "eval/listening_sheet.csv", list(absolute[0]) if absolute else [], absolute)
    write_csv(output_root / "eval/listening_sheet_KEY.csv", list(absolute_key[0]) if absolute_key else [], absolute_key)

    grouped: dict[tuple[str, str], dict[str, dict]] = defaultdict(dict)
    for row in rows:
        grouped[(row["language"], row["prompt_id"])][row["model"]] = row
    pairs, pair_key = [], []
    for pair_index, ((language, prompt_id), candidates) in enumerate(sorted(grouped.items()), start=1):
        expected = CANDIDATES[language]
        if not all(candidate in candidates for candidate in expected):
            continue
        a_model, b_model = expected if rng.choice([True, False]) else expected[::-1]
        a, b = candidates[a_model], candidates[b_model]
        pair_id = f"pair-{pair_index:03d}"
        pairs.append({
            "pair_id": pair_id, "language": language, "input_text": a["text"], "reference_audio_path": reference,
            "clip_a_path": a["audio_path"], "clip_b_path": b["audio_path"], "listener_id": "",
            "naturalness_preference": "", "speaker_preference": "", "pronunciation_preference": "", "comments": "",
        })
        pair_key.append({"pair_id": pair_id, "prompt_id": prompt_id, "a_model": a_model, "a_run_id": a["run_id"], "b_model": b_model, "b_run_id": b["run_id"]})
    write_csv(output_root / "eval/ab_listening_sheet.csv", list(pairs[0]) if pairs else [], pairs)
    write_csv(output_root / "eval/ab_listening_sheet_KEY.csv", list(pair_key[0]) if pair_key else [], pair_key)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/benchmark.yaml")
    make_sheets(parser.parse_args().config)
