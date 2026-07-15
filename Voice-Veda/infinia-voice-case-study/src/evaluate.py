"""Generate auditable ASR WER and speaker-cosine metrics for measured clips."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

from common import ROOT, load_config, resolve_path
from normalization import normalize_for_wer


def successful_rows(raw_path: Path) -> list[dict[str, Any]]:
    if not raw_path.is_file():
        raise FileNotFoundError(f"No benchmark JSONL found: {raw_path}")
    with raw_path.open("r", encoding="utf-8") as handle:
        return [
            json.loads(line)
            for line in handle
            if line.strip() and json.loads(line).get("status") == "ok" and not json.loads(line).get("is_warmup")
        ]


def load_asr(config: dict[str, Any]):
    from faster_whisper import WhisperModel

    asr = config["asr"]
    try:
        return WhisperModel(asr["model"], device="cuda", compute_type=asr["compute_type"])
    except Exception:
        return WhisperModel(asr["model"], device="cpu", compute_type="int8")


def transcribe(model: Any, audio_path: Path, language: str, config: dict[str, Any]) -> str:
    options = config["asr"]
    segments, _ = model.transcribe(
        str(audio_path), language=language, beam_size=int(options["beam_size"]), vad_filter=bool(options["vad_filter"])
    )
    return " ".join(segment.text.strip() for segment in segments).strip()


def load_speaker_encoder(config: dict[str, Any]):
    from speechbrain.inference.speaker import EncoderClassifier

    return EncoderClassifier.from_hparams(source=config["speaker_embedding"]["model"], savedir=str(ROOT / "outputs/eval/speechbrain-ecapa"))


def embedding(encoder: Any, audio_path: Path):
    import torch
    import torchaudio

    signal, sample_rate = torchaudio.load(str(audio_path))
    signal = signal.mean(dim=0, keepdim=True)
    if sample_rate != 16000:
        signal = torchaudio.functional.resample(signal, sample_rate, 16000)
    return encoder.encode_batch(signal).squeeze()


def cosine(reference, generated) -> float:
    import torch

    return float(torch.nn.functional.cosine_similarity(reference.unsqueeze(0), generated.unsqueeze(0)).item())


def evaluate(config_path: str) -> Path:
    config = load_config(config_path)
    output_root = resolve_path(config["output_root"])
    rows = successful_rows(output_root / "raw/benchmark.jsonl")
    if not rows:
        raise RuntimeError("No successful measured benchmark rows are available for evaluation")
    asr = load_asr(config)
    encoder = load_speaker_encoder(config)
    reference = resolve_path(config["reference_audio"])
    reference_embedding = embedding(encoder, reference)
    output_path = output_root / "eval/objective_metrics.csv"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "run_id", "model", "language", "prompt_id", "category", "repetition", "audio_path", "input_text",
        "asr_text", "normalized_input", "normalized_asr", "wer", "speaker_cosine", "status", "error",
    ]
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            result = {key: row.get(key) for key in ["run_id", "model", "language", "prompt_id", "category", "repetition", "audio_path"]}
            result["input_text"] = row["text"]
            try:
                from jiwer import wer

                audio = resolve_path(row["audio_path"])
                asr_text = transcribe(asr, audio, row["language"], config)
                normalized_input = normalize_for_wer(row["text"], row["language"])
                normalized_asr = normalize_for_wer(asr_text, row["language"])
                result.update(
                    asr_text=asr_text,
                    normalized_input=normalized_input,
                    normalized_asr=normalized_asr,
                    wer=round(float(wer(normalized_input, normalized_asr)), 6),
                    speaker_cosine=round(cosine(reference_embedding, embedding(encoder, audio)), 6),
                    status="ok",
                    error="",
                )
            except Exception as exc:
                result.update(asr_text="", normalized_input="", normalized_asr="", wer="", speaker_cosine="", status="error", error=f"{type(exc).__name__}: {exc}")
            writer.writerow(result)
    return output_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/benchmark.yaml")
    print(evaluate(parser.parse_args().config))

