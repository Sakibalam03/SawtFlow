"""Run Chatterbox Turbo or Multilingual V3 in its isolated environment."""

from __future__ import annotations

from pathlib import Path

from common import effective_config, load_config, parse_runner_args, run_model


def main() -> None:
    args = parse_runner_args("Benchmark Chatterbox variants", include_variant=True)
    if not args.variant:
        raise SystemExit("--variant mtl-v3 or --variant turbo is required")
    config = effective_config(load_config(args.config), args)
    if args.variant == "mtl-v3":
        model_name, languages = "chatterbox-multilingual-v3", ["en", "ar", "hi"]

        def load_model(settings):
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS

            return ChatterboxMultilingualTTS.from_pretrained(device=settings["device"], t3_model="v3")

        def synthesize(model, prompt, reference: Path, _settings):
            audio = model.generate(prompt.text, language_id=prompt.language, audio_prompt_path=str(reference))
            return audio, model.sr
    else:
        model_name, languages = "chatterbox-turbo", ["en"]

        def load_model(settings):
            from chatterbox.tts_turbo import ChatterboxTurboTTS

            return ChatterboxTurboTTS.from_pretrained(device=settings["device"])

        def synthesize(model, prompt, reference: Path, _settings):
            audio = model.generate(prompt.text, audio_prompt_path=str(reference))
            return audio, model.sr

    run_model(model_name, languages, config, load_model, synthesize)


if __name__ == "__main__":
    main()
