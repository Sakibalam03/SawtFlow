"""Persistent Chatterbox Multilingual worker for Hindi and Arabic UI requests."""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
from pathlib import Path

from common import cuda_synchronize, load_config, peak_memory_mb, reset_peak_memory, resolve_path, save_audio, seed_everything


def emit(payload: dict) -> None:
    print("INFINIA_WORKER=" + json.dumps(payload), flush=True)


def main() -> None:
    try:
        # The installed Chatterbox package forwards HF_TOKEN directly to
        # snapshot_download. An empty value becomes the invalid HTTP header
        # ``Bearer ``; omit blank tokens and use anonymous public download.
        if not os.environ.get("HF_TOKEN", "").strip():
            os.environ.pop("HF_TOKEN", None)
        config = load_config("configs/benchmark.yaml")
        reference = resolve_path(config["reference_audio"])
        if not reference.is_file():
            raise FileNotFoundError(f"Reference WAV is required: {reference}")
        seed_everything(int(config["seed"]))
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        device = str(config["device"])
        started = time.perf_counter()
        model = ChatterboxMultilingualTTS.from_pretrained(device=device)
        cuda_synchronize(device)
        load_seconds = time.perf_counter() - started
        started = time.perf_counter()
        model.prepare_conditionals(str(reference), exaggeration=0.5)
        cuda_synchronize(device)
        conditioned_reference = str(reference.resolve())
        emit({"kind": "ready", "loadSeconds": load_seconds, "conditioningSeconds": time.perf_counter() - started})
    except Exception:
        emit({"kind": "startup_error", "error": traceback.format_exc(limit=3)})
        return

    for line in sys.stdin:
        try:
            request = json.loads(line)
            if request.get("kind") == "shutdown":
                emit({"kind": "stopped"})
                break
            request_id, text, language = request["id"], str(request["text"]).strip(), str(request["language"])
            output = Path(request["output"])
            requested_reference = Path(request.get("reference", reference)).resolve()
            if not requested_reference.is_file():
                raise FileNotFoundError("Selected voice reference WAV is missing.")
            if language not in {"ar", "hi"}:
                raise ValueError("Multilingual worker supports Arabic and Hindi only.")
            if not text or len(text) > 1000:
                raise ValueError("Text must contain 1 to 1,000 characters.")
            reset_peak_memory(device); cuda_synchronize(device); started = time.perf_counter()
            if str(requested_reference) != conditioned_reference:
                model.prepare_conditionals(str(requested_reference), exaggeration=0.5)
                conditioned_reference = str(requested_reference)
            # A zero CFG weight avoids carrying the English reference accent into
            # the target language while retaining the speaker conditioning.
            waveform = model.generate(text, language_id=language, cfg_weight=0.0)
            cuda_synchronize(device); generation_seconds = time.perf_counter() - started
            output.parent.mkdir(parents=True, exist_ok=True)
            emit({"kind": "result", "id": request_id, "audioDuration": save_audio(waveform, model.sr, output), "generationSeconds": generation_seconds, "peakVramMb": peak_memory_mb(device)})
        except Exception:
            emit({"kind": "error", "id": request.get("id") if "request" in locals() else None, "error": traceback.format_exc(limit=3)})


if __name__ == "__main__":
    main()
