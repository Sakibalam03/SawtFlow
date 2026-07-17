"""Run the IndicF5 Hindi challenger through its documented model interface."""

from __future__ import annotations

from pathlib import Path

from common import effective_config, load_config, parse_runner_args, run_model, validate_reference


def main() -> None:
    args = parse_runner_args("Benchmark IndicF5")
    config = effective_config(load_config(args.config), args)
    validate_reference(config, require_transcript=True)

    def load_model(settings):
        from transformers import AutoModel

        return AutoModel.from_pretrained("ai4bharat/IndicF5", trust_remote_code=True).to(settings["device"])

    def synthesize(model, prompt, reference: Path, settings):
        waveform = model(
            prompt.text, ref_audio_path=str(reference), ref_text=settings["reference_transcript"]
        )
        return waveform, 24000

    run_model("indicf5", ["hi"], config, load_model, synthesize)


if __name__ == "__main__":
    main()
