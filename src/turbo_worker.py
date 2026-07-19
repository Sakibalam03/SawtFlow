"""Persistent Chatterbox Turbo worker used by the local web interface."""

from __future__ import annotations

import json
import sys
import time
import traceback
from pathlib import Path

from common import cuda_synchronize, load_config, peak_memory_mb, reset_peak_memory, resolve_path, save_audio, seed_everything


def emit(payload: dict) -> None:
    print("INFINIA_WORKER=" + json.dumps(payload), flush=True)


def main() -> None:
    try:
        config = load_config("configs/benchmark.yaml")
        reference = resolve_path(config["reference_audio"])
        if not reference.is_file():
            raise FileNotFoundError(f"Reference WAV is required: {reference}")

        seed_everything(int(config["seed"]))
        from chatterbox.tts_turbo import ChatterboxTurboTTS

        device = str(config["device"])
        load_start = time.perf_counter()
        model = ChatterboxTurboTTS.from_pretrained(device=device)
        cuda_synchronize(device)
        load_seconds = time.perf_counter() - load_start

        conditioning_start = time.perf_counter()
        model.prepare_conditionals(str(reference), exaggeration=0.0, norm_loudness=True)
        cuda_synchronize(device)
        conditioning_seconds = time.perf_counter() - conditioning_start
        conditioned_reference = str(reference.resolve())
        emit({"kind": "ready", "loadSeconds": load_seconds, "conditioningSeconds": conditioning_seconds})
    except Exception:
        emit({"kind": "startup_error", "error": traceback.format_exc(limit=3)})
        return

    for line in sys.stdin:
        try:
            request = json.loads(line)
            if request.get("kind") == "shutdown":
                emit({"kind": "stopped"})
                break
            request_id = request["id"]
            text = str(request["text"]).strip()
            output = Path(request["output"])
            requested_reference = Path(request.get("reference", reference)).resolve()
            if not requested_reference.is_file():
                raise FileNotFoundError("Selected voice reference WAV is missing.")
            if not text:
                raise ValueError("Text must not be empty.")
            if len(text) > 1000:
                raise ValueError("Text must be 1,000 characters or fewer.")

            reset_peak_memory(device)
            cuda_synchronize(device)
            generation_start = time.perf_counter()
            if str(requested_reference) != conditioned_reference:
                model.prepare_conditionals(str(requested_reference), exaggeration=0.0, norm_loudness=True)
                conditioned_reference = str(requested_reference)
            waveform = model.generate(text)
            cuda_synchronize(device)
            generation_seconds = time.perf_counter() - generation_start
            output.parent.mkdir(parents=True, exist_ok=True)
            audio_duration = save_audio(waveform, model.sr, output)
            emit({
                "kind": "result", "id": request_id, "audioDuration": audio_duration,
                "generationSeconds": generation_seconds, "peakVramMb": peak_memory_mb(device),
            })
        except Exception:
            emit({"kind": "error", "id": request.get("id") if "request" in locals() else None, "error": traceback.format_exc(limit=3)})


if __name__ == "__main__":
    main()
