"""Generate one local Chatterbox Turbo voice-cloned WAV for the web UI."""

from __future__ import annotations

import argparse
import json

from common import load_config, resolve_path, save_audio, seed_everything


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a Chatterbox Turbo WAV")
    parser.add_argument("--text", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--config", default="configs/benchmark.yaml")
    args = parser.parse_args()

    text = args.text.strip()
    if not text:
        raise ValueError("Text must not be empty.")

    config = load_config(args.config)
    reference = resolve_path(config["reference_audio"])
    if not reference.is_file():
        raise FileNotFoundError(f"Reference WAV is required: {reference}")

    seed_everything(int(config["seed"]))
    from chatterbox.tts_turbo import ChatterboxTurboTTS

    model = ChatterboxTurboTTS.from_pretrained(device=str(config["device"]))
    waveform = model.generate(text, audio_prompt_path=str(reference))
    output = resolve_path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    duration = save_audio(waveform, model.sr, output)
    print("INFINIA_RESULT=" + json.dumps({"path": str(output), "duration": duration}))


if __name__ == "__main__":
    main()
