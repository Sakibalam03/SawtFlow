"""Persistent IndicF5 worker used as the primary Hindi UI pipeline."""
from __future__ import annotations
import json, os, sys, time, traceback
from pathlib import Path
from common import cuda_synchronize, load_config, peak_memory_mb, reset_peak_memory, resolve_path, save_audio, seed_everything

def emit(payload: dict) -> None: print("INFINIA_WORKER=" + json.dumps(payload), flush=True)
def main() -> None:
    try:
        if not os.environ.get("HF_TOKEN", "").strip(): os.environ.pop("HF_TOKEN", None)
        config = load_config("configs/benchmark.yaml"); reference = resolve_path(config["reference_audio"])
        seed_everything(int(config["seed"])); from transformers import AutoModel
        device = str(config["device"]); started = time.perf_counter()
        model = AutoModel.from_pretrained("ai4bharat/IndicF5", trust_remote_code=True).to(device)
        cuda_synchronize(device); emit({"kind":"ready","loadSeconds":time.perf_counter()-started,"conditioningSeconds":0})
    except Exception: emit({"kind":"startup_error","error":traceback.format_exc(limit=3)}); return
    for line in sys.stdin:
        try:
            request = json.loads(line.lstrip("\ufeff"))
            if request.get("kind") == "shutdown": emit({"kind":"stopped"}); break
            text, output = str(request["text"]).strip(), Path(request["output"])
            if not text or len(text) > 1000: raise ValueError("Text must contain 1 to 1,000 characters.")
            reset_peak_memory(device); cuda_synchronize(device); started = time.perf_counter()
            waveform = model(text, ref_audio_path=str(reference), ref_text=config["reference_transcript"])
            cuda_synchronize(device); output.parent.mkdir(parents=True, exist_ok=True)
            emit({"kind":"result","id":request["id"],"audioDuration":save_audio(waveform,24000,output),"generationSeconds":time.perf_counter()-started,"peakVramMb":peak_memory_mb(device)})
        except Exception: emit({"kind":"error","id":request.get("id") if "request" in locals() else None,"error":traceback.format_exc(limit=3)})
if __name__ == "__main__": main()
