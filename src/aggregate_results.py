"""Aggregate raw, objective, and optional listener evidence by language and model."""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

from common import load_config, resolve_path


EXPECTED = {
    ("en", "chatterbox-multilingual-v3"), ("en", "chatterbox-turbo"),
    ("ar", "chatterbox-multilingual-v3"), ("ar", "xtts-v2"),
    ("hi", "chatterbox-multilingual-v3"), ("hi", "indicf5"),
}


def csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        return []
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def jsonl_rows(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    with path.open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def mean(values: Iterable[float]) -> float | None:
    values = list(values)
    return round(statistics.fmean(values), 6) if values else None


def median(values: Iterable[float]) -> float | None:
    values = list(values)
    return round(statistics.median(values), 6) if values else None


def p95(values: Iterable[float]) -> float | None:
    values = sorted(values)
    return round(values[min(len(values) - 1, math.ceil(len(values) * 0.95) - 1)], 6) if values else None


def rating_summary(output_root: Path) -> dict[str, dict[str, float | int | None]]:
    key = {row["blind_id"]: row for row in csv_rows(output_root / "eval/listening_sheet_KEY.csv")}
    grouped: dict[str, dict[str, list[float] | set[str]]] = defaultdict(lambda: defaultdict(list))
    listeners: dict[str, set[str]] = defaultdict(set)
    for row in csv_rows(output_root / "eval/listener_ratings_completed.csv"):
        mapping = key.get(row.get("blind_id", ""))
        if not mapping:
            continue
        condition = f"{mapping['model']}|{mapping.get('prompt_id', '')}"  # retained for audit only
        condition = f"{mapping['model']}|{row.get('language', '')}" if row.get("language") else mapping["model"]
        listener = row.get("listener_id", "").strip()
        if listener:
            listeners[condition].add(listener)
        for field, source in (("mos", "naturalness_1_to_5"), ("identity", "same_speaker_1_to_5"), ("pronunciation", "pronunciation_1_to_5")):
            value = number(row.get(source))
            if value is not None:
                grouped[condition][field].append(value)
    return {
        condition: {
            "mos": mean(values.get("mos", [])), "identity": mean(values.get("identity", [])),
            "pronunciation": mean(values.get("pronunciation", [])), "listeners": len(listeners[condition]),
        }
        for condition, values in grouped.items()
    }


def rating_summary_by_condition(output_root: Path) -> dict[tuple[str, str], dict[str, float | int | None]]:
    key = {row["blind_id"]: row for row in csv_rows(output_root / "eval/listening_sheet_KEY.csv")}
    sheet = {row["blind_id"]: row for row in csv_rows(output_root / "eval/listening_sheet.csv")}
    grouped: dict[tuple[str, str], dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    listeners: dict[tuple[str, str], set[str]] = defaultdict(set)
    for row in csv_rows(output_root / "eval/listener_ratings_completed.csv"):
        mapping, presented = key.get(row.get("blind_id", "")), sheet.get(row.get("blind_id", ""))
        if not mapping or not presented:
            continue
        condition = (presented["language"], mapping["model"])
        if row.get("listener_id", "").strip():
            listeners[condition].add(row["listener_id"].strip())
        for field, source in (("mos", "naturalness_1_to_5"), ("identity", "same_speaker_1_to_5"), ("pronunciation", "pronunciation_1_to_5")):
            value = number(row.get(source))
            if value is not None:
                grouped[condition][field].append(value)
    return {
        condition: {"mos": mean(v.get("mos", [])), "identity": mean(v.get("identity", [])), "pronunciation": mean(v.get("pronunciation", [])), "listeners": len(listeners[condition])}
        for condition, v in grouped.items()
    }


def ab_wins(output_root: Path) -> dict[tuple[str, str], dict[str, int | float | None]]:
    key = {row["pair_id"]: row for row in csv_rows(output_root / "eval/ab_listening_sheet_KEY.csv")}
    sheet = {row["pair_id"]: row for row in csv_rows(output_root / "eval/ab_listening_sheet.csv")}
    counts: dict[tuple[str, str], Counter] = defaultdict(Counter)
    for row in csv_rows(output_root / "eval/ab_ratings_completed.csv"):
        mapping, presented = key.get(row.get("pair_id", "")), sheet.get(row.get("pair_id", ""))
        choice = row.get("speaker_preference", "").strip().upper()
        if not mapping or not presented or choice not in {"A", "B", "TIE"}:
            continue
        language = presented["language"]
        if choice == "TIE":
            for model in (mapping["a_model"], mapping["b_model"]):
                counts[(language, model)]["ties"] += 1
        else:
            winner = mapping["a_model"] if choice == "A" else mapping["b_model"]
            loser = mapping["b_model"] if choice == "A" else mapping["a_model"]
            counts[(language, winner)]["wins"] += 1
            counts[(language, loser)]["losses"] += 1
    result = {}
    for condition, count in counts.items():
        non_ties = count["wins"] + count["losses"]
        result[condition] = {"ab_wins": count["wins"], "ab_losses": count["losses"], "ab_ties": count["ties"], "ab_speaker_win_rate": round(count["wins"] / non_ties, 6) if non_ties else None}
    return result


def aggregate(config_path: str) -> Path:
    config = load_config(config_path)
    output_root = resolve_path(config["output_root"])
    raw = [row for row in jsonl_rows(output_root / "raw/benchmark.jsonl") if not row.get("is_warmup")]
    objective = [row for row in csv_rows(output_root / "eval/objective_metrics.csv") if row.get("status") == "ok"]
    by_raw: dict[tuple[str, str], list[dict]] = defaultdict(list)
    by_objective: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in raw:
        by_raw[(row["language"], row["model"])].append(row)
    for row in objective:
        by_objective[(row["language"], row["model"])].append(row)
    ratings, preferences = rating_summary_by_condition(output_root), ab_wins(output_root)
    fields = [
        "language", "model", "attempted_runs", "successful_runs", "failure_rate", "median_load_s", "median_full_clip_latency_s",
        "p95_full_clip_latency_s", "median_ttfa_s", "ttfa_mode", "median_rtf", "p95_rtf", "max_peak_vram_mb", "mean_wer",
        "mean_speaker_cosine", "min_speaker_cosine", "mos", "human_same_speaker", "pronunciation", "unique_listeners",
        "ab_speaker_wins", "ab_speaker_losses", "ab_speaker_ties", "ab_speaker_win_rate", "evidence_complete", "mos_pass",
        "speaker_pass", "latency_pass", "rtf_pass", "wer_pass", "overall_pass",
    ]
    output_path = output_root / "eval/results_summary.csv"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for condition in sorted(EXPECTED):
            attempts, metrics = by_raw[condition], by_objective[condition]
            successes = [row for row in attempts if row.get("status") == "ok"]
            timing = [number(row.get("full_clip_latency_s")) for row in successes]
            rtf = [number(row.get("rtf")) for row in successes]
            load = [number(row.get("load_s")) for row in successes]
            vram = [number(row.get("peak_vram_mb")) for row in successes]
            timing, rtf, load, vram = ([v for v in values if v is not None] for values in (timing, rtf, load, vram))
            wers = [number(row.get("wer")) for row in metrics]
            cosines = [number(row.get("speaker_cosine")) for row in metrics]
            wers, cosines = ([v for v in values if v is not None] for values in (wers, cosines))
            human, ab = ratings.get(condition, {}), preferences.get(condition, {})
            evidence_complete = bool(successes) and len(metrics) == len(successes) and human.get("mos") is not None
            mos_pass = human.get("mos") is not None and human["mos"] >= 4.0
            speaker_pass = (mean(cosines) is not None and mean(cosines) >= 0.75) or (human.get("identity") is not None and human["identity"] >= 4.0)
            latency_pass = median(timing) is not None and median(timing) < 2.0
            rtf_pass = median(rtf) is not None and median(rtf) <= 0.5
            wer_pass = mean(wers) is not None and mean(wers) <= 0.10
            writer.writerow({
                "language": condition[0], "model": condition[1], "attempted_runs": len(attempts), "successful_runs": len(successes),
                "failure_rate": round((len(attempts) - len(successes)) / len(attempts), 6) if attempts else None,
                "median_load_s": median(load), "median_full_clip_latency_s": median(timing), "p95_full_clip_latency_s": p95(timing),
                "median_ttfa_s": None, "ttfa_mode": "not_measured_batch_api", "median_rtf": median(rtf), "p95_rtf": p95(rtf),
                "max_peak_vram_mb": max(vram) if vram else None, "mean_wer": mean(wers), "mean_speaker_cosine": mean(cosines),
                "min_speaker_cosine": min(cosines) if cosines else None, "mos": human.get("mos"), "human_same_speaker": human.get("identity"),
                "pronunciation": human.get("pronunciation"), "unique_listeners": human.get("listeners", 0), **ab,
                "evidence_complete": evidence_complete, "mos_pass": mos_pass, "speaker_pass": speaker_pass, "latency_pass": latency_pass,
                "rtf_pass": rtf_pass, "wer_pass": wer_pass, "overall_pass": evidence_complete and mos_pass and speaker_pass and latency_pass and rtf_pass and wer_pass,
            })
    return output_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/benchmark.yaml")
    print(aggregate(parser.parse_args().config))

