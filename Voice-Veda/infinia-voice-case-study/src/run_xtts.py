"""Run XTTS-v2 for the Arabic challenger condition."""

from __future__ import annotations

from pathlib import Path

from common import effective_config, load_config, parse_runner_args, run_model


def main() -> None:
    args = parse_runner_args("Benchmark XTTS-v2")
    config = effective_config(load_config(args.config), args)

    def load_model(settings):
        from TTS.api import TTS

        return TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(settings["device"])

    def synthesize(model, prompt, reference: Path, _settings):
        audio = model.tts(text=prompt.text, speaker_wav=str(reference), language=prompt.language)
        return audio, int(model.synthesizer.output_sample_rate)

    run_model("xtts-v2", ["ar"], config, load_model, synthesize)


if __name__ == "__main__":
    main()

