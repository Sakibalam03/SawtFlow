"""Keep objective evaluation models loaded for the local Next.js UI."""

from __future__ import annotations

import datetime as dt
import json
import sys
import time
from pathlib import Path
from typing import Any

from common import ROOT, load_config, resolve_path
from evaluate import cosine, embedding, load_asr, load_speaker_encoder, transcribe
from normalization import normalize_for_wer


def emit(payload: dict[str, Any]) -> None:
    print("INFINIA_EVALUATOR=" + json.dumps(payload), flush=True)


def run_rows() -> list[dict[str, Any]]:
    path = ROOT / "outputs/ui/runs.jsonl"
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


class Evaluator:
    def __init__(self, config_path: str = "configs/benchmark.yaml") -> None:
        self.config = load_config(config_path)
        started = time.perf_counter()
        # Turbo uses CUDA in the companion worker. Evaluation stays on CPU so
        # metric requests cannot evict or contend with the voice model.
        self.asr = load_asr(self.config, device="cpu")
        self.encoder = load_speaker_encoder(self.config, device="cpu")
        self.references: dict[str, Any] = {}
        self.startup_seconds = time.perf_counter() - started

    def evaluate(self, run_id: str) -> dict[str, Any]:
        result: dict[str, Any] = {
            "runId": run_id,
            "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "status": "error",
        }
        try:
            run = next((item for item in reversed(run_rows()) if item.get("runId") == run_id), None)
            if not run or run.get("status") != "ok" or not run.get("audioFile"):
                raise ValueError("No successful UI generation was found for this run.")
            audio = ROOT / "outputs/ui" / run["audioFile"]
            if not audio.is_file():
                raise FileNotFoundError(f"Generated WAV is missing: {audio}")
            reference_path = resolve_path(run.get("referenceAudio", self.config["reference_audio"]))
            if not reference_path.is_file():
                raise FileNotFoundError(f"Reference WAV is missing: {reference_path}")
            reference_key = str(reference_path.resolve())
            if reference_key not in self.references:
                self.references[reference_key] = embedding(self.encoder, reference_path)
            from jiwer import wer

            started = time.perf_counter()
            language = run.get("language", "en")
            asr_text = transcribe(self.asr, audio, language, self.config)
            normalized_input = normalize_for_wer(run["text"], language)
            normalized_asr = normalize_for_wer(asr_text, language)
            result.update(
                status="ok",
                asrText=asr_text,
                wer=round(float(wer(normalized_input, normalized_asr)), 6),
                speakerCosine=round(cosine(self.references[reference_key], embedding(self.encoder, audio)), 6),
                evaluationSeconds=round(time.perf_counter() - started, 6),
            )
        except Exception as exc:
            result["error"] = f"{type(exc).__name__}: {exc}"
        output = ROOT / "outputs/ui/evaluations.jsonl"
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(result, ensure_ascii=False) + "\n")
        return result


def main() -> None:
    try:
        evaluator = Evaluator()
        emit({"kind": "ready", "startupSeconds": evaluator.startup_seconds})
    except Exception as exc:
        emit({"kind": "startup_error", "error": f"{type(exc).__name__}: {exc}"})
        raise SystemExit(1)
    for line in sys.stdin:
        try:
            request = json.loads(line)
            request_id = str(request["id"])
            run_id = str(request["runId"])
            result = evaluator.evaluate(run_id)
            emit({"kind": "result", "id": request_id, "evaluation": result})
        except Exception as exc:
            emit({"kind": "error", "id": request.get("id") if "request" in locals() else "", "error": f"{type(exc).__name__}: {exc}"})


if __name__ == "__main__":
    main()
