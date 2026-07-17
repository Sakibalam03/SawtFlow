"""Shared, auditable utilities for every benchmark model worker."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import random
import re
import time
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable


ROOT = Path(__file__).resolve().parents[1]
PLACEHOLDER_TRANSCRIPT = "EXACT WORDS SPOKEN IN reference.wav"


@dataclass(frozen=True)
class Prompt:
    prompt_id: str
    language: str
    category: str
    text: str


def parse_runner_args(description: str, include_variant: bool = False) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--config", default="configs/benchmark.yaml")
    parser.add_argument("--repetitions", type=int)
    parser.add_argument("--warmup-runs", type=int)
    parser.add_argument("--device")
    parser.add_argument("--output-root")
    parser.add_argument("--languages", nargs="+", choices=["en", "ar", "hi"])
    if include_variant:
        parser.add_argument("--variant", choices=["mtl-v3", "turbo"])
    return parser.parse_args()


def resolve_path(path: str | Path) -> Path:
    candidate = Path(path)
    return candidate if candidate.is_absolute() else ROOT / candidate


def load_config(path: str | Path) -> dict[str, Any]:
    import yaml

    with resolve_path(path).open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def effective_config(config: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    result = dict(config)
    for key, value in {
        "repetitions": args.repetitions,
        "warmup_runs": args.warmup_runs,
        "device": args.device,
        "output_root": args.output_root,
        "languages": args.languages,
    }.items():
        if value is not None:
            result[key] = value
    return result


def read_prompts(config: dict[str, Any], languages: Iterable[str]) -> list[Prompt]:
    prompt_path = resolve_path("data/prompts.csv")
    wanted = set(languages)
    with prompt_path.open("r", encoding="utf-8", newline="") as handle:
        rows = [Prompt(**row) for row in csv.DictReader(handle) if row["language"] in wanted]
    if not rows:
        raise ValueError(f"No prompts found for languages: {sorted(wanted)}")
    return rows


def validate_reference(config: dict[str, Any], require_transcript: bool = False) -> Path:
    path = resolve_path(config["reference_audio"])
    if not path.is_file():
        raise FileNotFoundError(f"Reference WAV is required: {path}")
    if require_transcript and config.get("reference_transcript", "").strip() == PLACEHOLDER_TRANSCRIPT:
        raise ValueError("IndicF5 requires the exact reference transcript in configs/benchmark.yaml")
    return path


def seed_everything(seed: int) -> None:
    random.seed(seed)
    try:
        import numpy as np
        import torch

        np.random.seed(seed)
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
    except ImportError:
        pass


def cuda_synchronize(device: str) -> None:
    try:
        import torch

        if device.startswith("cuda") and torch.cuda.is_available():
            torch.cuda.synchronize()
    except ImportError:
        pass


def reset_peak_memory(device: str) -> None:
    try:
        import torch

        if device.startswith("cuda") and torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()
    except ImportError:
        pass


def peak_memory_mb(device: str) -> float | None:
    try:
        import torch

        if device.startswith("cuda") and torch.cuda.is_available():
            return round(torch.cuda.max_memory_allocated() / (1024 * 1024), 3)
    except ImportError:
        pass
    return None


def timed_call(call: Callable[[], tuple[Any, int]], device: str) -> tuple[Any, int, float, float | None]:
    reset_peak_memory(device)
    cuda_synchronize(device)
    start = time.perf_counter()
    waveform, sample_rate = call()
    cuda_synchronize(device)
    generation_s = time.perf_counter() - start
    return waveform, sample_rate, generation_s, peak_memory_mb(device)


def safe_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value)


def save_audio(waveform: Any, sample_rate: int, path: Path) -> float:
    import numpy as np
    import soundfile as sf

    if hasattr(waveform, "detach"):
        waveform = waveform.detach().cpu().numpy()
    samples = np.asarray(waveform, dtype=np.float32).squeeze()
    if samples.ndim != 1 or samples.size == 0:
        raise ValueError("Expected a non-empty mono waveform")
    if not np.isfinite(samples).all():
        raise ValueError("Waveform contains non-finite samples")
    peak = float(np.max(np.abs(samples)))
    if peak > 1.0:
        samples = samples / peak
    if sample_rate <= 0:
        raise ValueError("Sample rate must be positive")
    duration = len(samples) / sample_rate
    if duration < 0.1:
        raise ValueError(f"Suspiciously short waveform: {duration:.3f}s")
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, samples, sample_rate, subtype="PCM_16")
    return duration


def append_jsonl(path: Path, row: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def run_id(model: str, prompt: Prompt, repetition: int) -> str:
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    return f"{safe_filename(model)}-{prompt.language}-{prompt.prompt_id}-r{repetition}-{stamp}"


def base_row(model: str, prompt: Prompt, repetition: int, is_warmup: bool, audio_path: Path) -> dict[str, Any]:
    return {
        "run_id": run_id(model, prompt, repetition),
        "model": model,
        "language": prompt.language,
        "prompt_id": prompt.prompt_id,
        "category": prompt.category,
        "text": prompt.text,
        "audio_path": str(audio_path.relative_to(ROOT)).replace("\\", "/"),
        "repetition": repetition,
        "is_warmup": is_warmup,
        "load_s": None,
        "generation_s": None,
        "full_clip_latency_s": None,
        "ttfa_s": None,
        "ttfa_mode": "not_measured_batch_api",
        "audio_s": None,
        "rtf": None,
        "peak_vram_mb": None,
        "sample_rate": None,
        "status": "error",
        "error": None,
        "created_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


def run_model(
    model_name: str,
    languages: Iterable[str],
    config: dict[str, Any],
    load_model: Callable[[dict[str, Any]], Any],
    synthesize: Callable[[Any, Prompt, Path, dict[str, Any]], tuple[Any, int]],
) -> None:
    """Run all prompts sequentially and retain an immutable row for every attempt."""
    seed_everything(int(config["seed"]))
    reference = validate_reference(config)
    supported_languages = set(languages)
    requested_languages = set(config.get("languages") or supported_languages)
    unsupported = requested_languages - supported_languages
    if unsupported:
        raise ValueError(f"{model_name} does not support requested language(s): {sorted(unsupported)}")
    prompts = read_prompts(config, requested_languages)
    output_root = resolve_path(config["output_root"])
    raw_path = output_root / "raw" / "benchmark.jsonl"
    device = str(config["device"])
    load_s: float | None = None
    try:
        load_start = time.perf_counter()
        model = load_model(config)
        cuda_synchronize(device)
        load_s = time.perf_counter() - load_start
    except Exception as exc:  # Fail every attempted prompt visibly when loading cannot complete.
        detail = "".join(traceback.format_exception_only(type(exc), exc)).strip()
        for prompt in prompts:
            audio_path = output_root / "audio" / safe_filename(model_name) / prompt.language / f"{prompt.prompt_id}_load_error.wav"
            row = base_row(model_name, prompt, 1, False, audio_path)
            row["error"] = detail
            append_jsonl(raw_path, row)
        raise RuntimeError(f"Could not load {model_name}: {detail}") from exc

    attempts = [(0, True)] * int(config["warmup_runs"]) + [
        (index, False) for index in range(1, int(config["repetitions"]) + 1)
    ]
    for prompt in prompts:
        for repetition, is_warmup in attempts:
            filename = f"{prompt.prompt_id}_{'warmup' if is_warmup else f'r{repetition}'}.wav"
            audio_path = output_root / "audio" / safe_filename(model_name) / prompt.language / filename
            row = base_row(model_name, prompt, repetition, is_warmup, audio_path)
            row["load_s"] = load_s
            try:
                waveform, sample_rate, generation_s, peak_vram = timed_call(
                    lambda: synthesize(model, prompt, reference, config), device
                )
                audio_s = save_audio(waveform, sample_rate, audio_path)
                row.update(
                    generation_s=round(generation_s, 6),
                    full_clip_latency_s=round(generation_s, 6),
                    audio_s=round(audio_s, 6),
                    rtf=round(generation_s / audio_s, 6),
                    peak_vram_mb=peak_vram,
                    sample_rate=sample_rate,
                    status="ok",
                )
            except Exception as exc:
                row["error"] = "".join(traceback.format_exception_only(type(exc), exc)).strip()
            append_jsonl(raw_path, row)
