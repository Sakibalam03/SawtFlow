# Infinia Multilingual Voice AI Pipeline

Track A benchmark harness for locally generated, consented voice cloning in
English, Modern Standard Arabic, and Hindi. The code compares a common
multilingual baseline with per-language challengers and records raw generation,
objective evaluation, and blinded human-listening evidence.

## Candidate matrix

| Language | Baseline | Challenger |
|---|---|---|
| English | Chatterbox Multilingual V3 | Chatterbox Turbo |
| Arabic | Chatterbox Multilingual V3 | XTTS-v2 |
| Hindi | Chatterbox Multilingual V3 | AI4Bharat IndicF5 |

The current wrappers use complete-waveform batch APIs. `full_clip_latency_s` is
measured after CUDA synchronization; `ttfa_s` is null and must not be reported
as streaming TTFA.

## Prerequisites

- Conda and NVIDIA drivers available on the benchmark host.
- A consented `data/references/reference.wav`, 8-12 seconds, mono or stereo WAV.
- The exact spoken transcript in `configs/benchmark.yaml`.
- Model access accepted where the upstream model requires it.

Do not use closed TTS APIs for any benchmark WAV. Do not commit model weights,
caches, tokens, or unrelated recordings.

## Run sequence

```bash
bash scripts/create_envs.sh
conda run -n infinia-chatterbox bash scripts/capture_system.sh chatterbox
conda run -n infinia-chatterbox python src/run_chatterbox.py --variant mtl-v3 --languages en --repetitions 1 --warmup-runs 0
conda run -n infinia-chatterbox python src/run_chatterbox.py --variant turbo --repetitions 1 --warmup-runs 0
conda run -n infinia-xtts python src/run_xtts.py --repetitions 1 --warmup-runs 0
conda run -n infinia-indicf5 python src/run_indicf5.py --repetitions 1 --warmup-runs 0
```

After smoke tests, clear or archive their JSONL and WAV output in a separately
named evidence directory, then use the configured one warm-up and three
measured repetitions for the full run. Run one model worker at a time on the
4 GB GPU.

```bash
bash scripts/run_chatterbox.sh
bash scripts/run_xtts.sh
bash scripts/run_indicf5.sh
bash scripts/run_evals.sh
conda run -n infinia-eval python src/aggregate_results.py
conda run -n infinia-eval python -m pytest tests/test_normalization.py
conda run -n infinia-eval python scripts/validate_submission.py
```

From PowerShell, `scripts/run_all.ps1 -Mode smoke` runs the four smoke commands.

## Evidence outputs

- `outputs/raw/benchmark.jsonl`: immutable success and failure rows.
- `outputs/audio/`: WAVs for successful attempts.
- `outputs/eval/objective_metrics.csv`: forced-language ASR, normalized WER, and ECAPA cosine per measured clip.
- `outputs/eval/listening_sheet.csv` and `ab_listening_sheet.csv`: blinded rating sheets.
- `outputs/eval/*_KEY.csv`: private mappings; do not distribute before ratings close.
- `outputs/eval/results_summary.csv`: language-by-model aggregation and target flags.

XTTS-v2 is evaluated under its CPML terms and is not automatically commercially
deployable. A quality result never overrides license restrictions.
