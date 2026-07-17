"""Evaluate one UI-generated clip for WER and speaker similarity."""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

from common import ROOT, load_config, resolve_path
from evaluate import cosine, embedding, load_asr, load_speaker_encoder, transcribe
from normalization import normalize_for_wer


def rows(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--config", default="configs/benchmark.yaml")
    args = parser.parse_args()
    result: dict = {"runId": args.run_id, "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(), "status": "error"}
    try:
        run = next((item for item in reversed(rows(ROOT / "outputs/ui/runs.jsonl")) if item.get("runId") == args.run_id), None)
        if not run or run.get("status") != "ok" or not run.get("audioFile"):
            raise ValueError("No successful UI generation was found for this run.")
        config = load_config(args.config)
        audio = ROOT / "outputs/ui" / run["audioFile"]
        if not audio.is_file():
            raise FileNotFoundError(f"Generated WAV is missing: {audio}")
        asr = load_asr(config)
        encoder = load_speaker_encoder(config)
        reference = resolve_path(config["reference_audio"])
        from jiwer import wer

        asr_text = transcribe(asr, audio, "en", config)
        normalized_input = normalize_for_wer(run["text"], "en")
        normalized_asr = normalize_for_wer(asr_text, "en")
        result.update(
            status="ok", asrText=asr_text,
            wer=round(float(wer(normalized_input, normalized_asr)), 6),
            speakerCosine=round(cosine(embedding(encoder, reference), embedding(encoder, audio)), 6),
        )
    except Exception as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"
    output = ROOT / "outputs/ui/evaluations.jsonl"
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(result, ensure_ascii=False) + "\n")
    print("INFINIA_EVALUATION=" + json.dumps(result))
    if result["status"] != "ok":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
