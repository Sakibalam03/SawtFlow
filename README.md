# Infinia multilingual voice benchmark

![Infinia multilingual voice benchmark interface](<assets/Screenshot 2026-07-18 050710.png>)

An evidence-first, local benchmark for consented voice cloning in English,
Modern Standard Arabic (MSA), and Hindi. It compares a shared multilingual
baseline with a language-specific challenger, produces WAVs and immutable run
records, scores intelligibility and speaker similarity, and prepares blinded
listener studies.

This repository has two complementary surfaces:

- **Benchmark CLI** — the reproducible, submission-oriented workflow. It runs
  all model conditions, writes auditable artifacts, and is the source of the
  final results table.
- **Local evaluation UI** — a Next.js interface for interactive English,
  Arabic, and Hindi generation with local per-clip telemetry. It is useful for
  demos and exploratory listening, but its session files are not a substitute
  for the blinded benchmark protocol.

## Contents

- [Scope and model matrix](#scope-and-model-matrix)
- [Quality bar and current results](#quality-bar-and-current-results)
- [Requirements and setup](#requirements-and-setup)
- [Reproduce a benchmark](#reproduce-a-benchmark)
- [Evaluate and collect listener evidence](#evaluate-and-collect-listener-evidence)
- [Run the local UI](#run-the-local-ui)
- [Artifacts and sample output](#artifacts-and-sample-output)
- [Interpretation, limitations, and safety](#interpretation-limitations-and-safety)

## Scope and model matrix

Every candidate receives the same three fixed prompts per language: a short
latency prompt, a names-and-numbers prompt, and a prosody/punctuation prompt.
The prompt text is versioned in [data/prompts.csv](data/prompts.csv). The
default protocol is one warm-up and three measured repetitions per prompt.

| Language | Baseline | Challenger | CLI worker |
|---|---|---|---|
| English | Chatterbox Multilingual V2 | Chatterbox Turbo | `src/run_chatterbox.py` |
| Arabic (MSA) | Chatterbox Multilingual V2 | XTTS-v2 | `src/run_chatterbox.py`, `src/run_xtts.py` |
| Hindi | Chatterbox Multilingual V2 | AI4Bharat IndicF5 | `src/run_chatterbox.py`, `src/run_indicf5.py` |

The interactive UI uses Chatterbox Turbo for English, IndicF5 for Hindi, and
Chatterbox Multilingual V2 for Arabic. Hindi automatically falls back to
Chatterbox Multilingual V2 when IndicF5 cannot start. The language-to-model
mapping, default, and fallback are centralized in
`configs/tts-pipelines.json`, so a model can be changed without altering the
route or UI code. The UI can also create a per-session browser voice profile:
its recorded WAV and exact transcript condition all three UI pipelines without
replacing the checked-in project reference.

### Repository map

| Path | Purpose |
|---|---|
| `configs/benchmark.yaml` | Seed, device, reference, prompt-run counts, model set, and evaluator configuration. |
| `configs/tts-pipelines.json` | UI language-to-model, worker, Conda environment, default, and fallback mapping. |
| `envs/` | Isolated Conda environments so model dependencies do not conflict. |
| `src/run_*.py` | Model-specific generation wrappers sharing the same timing and artifact logic. |
| `src/evaluate.py` | Forced-language Faster-Whisper WER and ECAPA speaker-cosine evaluation. |
| `src/make_listening_sheet.py` | Blinded absolute and paired A/B listening sheets. |
| `src/aggregate_results.py` | Per-language/per-model summary and target flags. |
| `outputs/` | Generated WAVs, JSONL run records, evaluation CSVs, local UI evidence, and browser-recorded voice profiles. |
| `evidence/` | Host and package snapshots captured for an actual benchmark run. |
| `report/REPORT_TEMPLATE.md` | Final submission-report template. |

## Quality bar and current results

### Acceptance criteria (Section 3)

The benchmark evaluates the following targets **per language**. A claim is only
complete when it comes from measured, non-warm-up runs and the stated human
evidence.

| Metric | How this project measures it | Target |
|---|---|---:|
| Naturalness (MOS) | Blinded listener mean, 1–5 | >= 4.0 / 5 |
| Speaker similarity | Mean ECAPA cosine **and** human same-speaker judgment | cosine >= 0.75, or listeners clearly judge the same speaker |
| Latency | CUDA-synchronized full-clip generation time for the short prompt | < 2 s full clip, or < 500 ms TTFA if a streaming API is demonstrated |
| Real-time factor (RTF) | `generation_s / generated_audio_s` | <= 0.5 |
| Intelligibility | Forced-language round-trip ASR WER after language-aware normalization | <= 10% |
| Cross-language robustness | All above checks for English, MSA Arabic, and Hindi | no language falls below the applicable bar |

Additional evidence retained by the harness includes p95 latency/RTF, peak
allocated GPU memory, failure rate, pronunciation ratings, prompt category,
and paired A/B preferences. The names-and-numbers and prosody prompts are
deliberate stress tests; inspect them during listening review rather than
relying on aggregate metrics alone.

### Results against Section 3

The repository does **not** yet contain a completed six-condition benchmark.
The observed UI values below are retained as single-run evidence only; they do
not replace the fixed-prompt, repeated, blinded benchmark protocol. `—` means
not measured.

| Language | Model | MOS | Speaker cosine / human A/B | Short-prompt full clip | RTF | WER |
|---|---|---:|---|---:|---:|---:|
| English | Chatterbox Turbo | 4.00 / 5† | 0.823 / 1 of 1 same† | 2.66 s† | 0.67† | 9.1%† |
| Arabic | Chatterbox Multilingual V2 | 4.00 / 5† | 0.796 / 1 of 1 same† | 9.85 s† | 1.55† | 0.0%† |
| Hindi | Chatterbox Multilingual V2 | 4.00 / 5† | 0.757 / 1 of 1 same† | 46.31 s† | 8.30† | 50.0%† |
| Hindi | IndicF5 | 5.00 / 5† | 0.686 / 1 of 1 same† | 9.23 s† | 2.75† | 0.0%† |

† Observed in the local UI on an NVIDIA GeForce RTX 3050 Laptop GPU, using one
free-text generation per condition. MOS and the same-speaker result each come
from one listener and are not blinded A/B evidence. The Hindi IndicF5 row used
a browser-recorded custom reference; the other retained rows used the project
reference, so they are not a controlled A/B model comparison. The full-clip
values are not the versioned short-latency benchmark prompt, and therefore
cannot support a Section 3 pass claim. The default benchmark uses batch APIs;
full-clip latency must never be reported as streaming TTFA.

When a full run is complete, regenerate
`outputs/eval/results_summary.csv` and copy its values into
`report/REPORT.md`. A condition passes overall only if it has complete
objective and listener evidence and passes MOS, speaker, latency, RTF, and WER
flags. The aggregation code applies these thresholds directly.

## Requirements and setup

### System requirements

- Windows with PowerShell (the included orchestration script), or Linux/macOS
  with Bash. Git Bash or WSL is convenient for the `scripts/*.sh` helpers on
  Windows.
- Conda or Miniconda.
- An NVIDIA GPU and a driver compatible with CUDA 12.6 for the pinned
  Chatterbox Torch/TorchAudio wheels. CPU fallback is not a comparable latency
  benchmark.
- Sufficient VRAM for one model at a time. The retained Turbo smoke run peaked
  around 3.3 GB allocated VRAM; treat that as an observation, not a capacity
  guarantee.
- Node.js current LTS and npm for the optional UI.
- Internet/model access for first-run package and model downloads. Some
  upstream models require accepting their terms or supplying a Hugging Face
  token.

Keep model caches, credentials, and downloaded checkpoints out of version
control. `.env` is ignored, but CLI workers do not load it automatically:
export `HF_TOKEN` in the shell that starts the worker when it is needed.

### 1. Create isolated environments

From the repository root, create the four environments. The Bash helper does
this in one command:

```bash
bash scripts/create_envs.sh
```

In PowerShell, run the equivalent commands:

```powershell
conda env create --file envs/chatterbox.yml --force
conda env create --file envs/xtts.yml --force
conda env create --file envs/indicf5.yml --force
conda env create --file envs/eval.yml --force
```

The environments are named `infinia-chatterbox`, `infinia-xtts`,
`infinia-indicf5`, and `infinia-eval`. Chatterbox explicitly pins
`torch==2.6.0+cu126` and `torchaudio==2.6.0+cu126`; use the package declarations
in `envs/` as the reproducibility source of truth. IndicF5 uses the matching
CUDA 12.6 Torch/TorchAudio builds, `numpy==1.26.4`, and
`transformers==4.49.0`; its upstream model code is not compatible with
Transformers 5.x.

If a model download requires a token, copy `.env.example` to `.env` for the UI
and export it before CLI use:

```powershell
$env:HF_TOKEN = "<your token>"
```

### 2. Prepare a permitted reference voice

Use one 8–12 second, single-speaker WAV without music, clipping, or strong
reverberation. You must have explicit permission for local TTS benchmarking
and submission evidence. Before generating:

1. Place the file at `data/references/reference.wav` (or change
   `reference_audio` in the config).
2. Update `data/references/CONSENT_OR_SOURCE.md` with the non-identifying
   reference ID, permission basis, date, scope, language, and exact spoken
   transcript.
3. Put the **same exact transcript** in
   `configs/benchmark.yaml` under `reference_transcript`. IndicF5 requires it
   and will reject the placeholder value.
4. Keep the source recording and permission documentation private if they
   identify a person.

For a non-WAV source, an example conversion is:

```bash
ffmpeg -y -i input.m4a -ac 1 -ar 24000 -c:a pcm_s16le data/references/reference.wav
```

The checkout includes a reference asset for the project smoke test, but the
consent/source record still contains fields to verify or complete. Do not treat
that asset as permission to reuse a real person’s voice beyond its documented
scope.

The local UI Voice Profile is separate from this formal benchmark reference.
It stores a browser-recorded WAV and transcript locally for interactive use;
it does not alter `configs/benchmark.yaml`, the CLI reference, or formal
benchmark evidence. Obtain the same permission and transcript accuracy for
each profile before using it.

### 3. Configure an isolated evidence directory

The default `output_root` is `outputs`. Generation appends JSONL records, so
do not mix smoke attempts and final evidence in the same directory. For each
formal run, copy `configs/benchmark.yaml` to a run-specific configuration,
change only its `output_root` (for example,
`outputs/2026-07-18-full-gpu-name`), then pass that config to **every** command
below. Preserve the seed, prompts, model revisions, and run counts unless you
are explicitly documenting a protocol change.

Capture host details and package snapshots at the start of a formal run:

```bash
conda run -n infinia-chatterbox bash scripts/capture_system.sh chatterbox
conda run -n infinia-xtts bash scripts/capture_system.sh xtts
conda run -n infinia-indicf5 bash scripts/capture_system.sh indicf5
conda run -n infinia-eval bash scripts/capture_system.sh eval
```

This writes `evidence/system_info_*.txt` and `evidence/pip-freeze_*.txt`.
Record GPU model, driver, OS, and any model access/revision decisions in the
final report.

## Reproduce a benchmark

### Quick smoke check

Run a cheap English-only batch check before a full benchmark:

```powershell
conda run -n infinia-chatterbox python src/run_chatterbox.py `
  --variant turbo --languages en --repetitions 1 --warmup-runs 0 `
  --config configs/benchmark.yaml --output-root outputs/smoke-local
```

Confirm that `outputs/smoke-local/raw/benchmark.jsonl` contains one successful
row (`status` is `ok`) for each English prompt and that corresponding WAVs
exist. This only proves the runner works; it does not meet the Section 3
protocol.

For the supplied PowerShell convenience runner, use:

```powershell
.\scripts\run_all.ps1 -Mode smoke
```

It exercises all configured workers and writes to the configured output root.
Run model workers sequentially on a small GPU; model memory is not shared.

### Full, comparable generation run

With a run-specific configuration selected, execute one worker at a time. The
default config performs one warm-up and three measured repetitions per prompt.

```bash
CONFIG=configs/benchmark.yaml

conda run -n infinia-chatterbox python src/run_chatterbox.py --variant mtl-v3 --config "$CONFIG"
conda run -n infinia-chatterbox python src/run_chatterbox.py --variant turbo --config "$CONFIG"
conda run -n infinia-xtts python src/run_xtts.py --config "$CONFIG"
conda run -n infinia-indicf5 python src/run_indicf5.py --config "$CONFIG"
```

In PowerShell, replace `CONFIG=...` with `$config = "configs/benchmark.yaml"`
and use `--config $config` in the same four commands. `scripts/run_chatterbox.sh`,
`scripts/run_xtts.sh`, and `scripts/run_indicf5.sh` provide the same Linux/Bash
wrappers.

The harness times each synthesis call after CUDA synchronization and separately
records model load time. It writes an immutable row for every successful or
failed attempt to `raw/benchmark.jsonl`. The timing fields mean:

| Field | Meaning |
|---|---|
| `load_s` | Model load time; diagnostic only and excluded from synthesis latency. |
| `full_clip_latency_s` / `generation_s` | Warm, CUDA-synchronized batch generation duration. |
| `audio_s` | Duration of the generated WAV. |
| `rtf` | `generation_s / audio_s`; lower is better. |
| `peak_vram_mb` | Peak PyTorch allocated memory during that request. |
| `ttfa_s` | `null` for these complete-waveform batch APIs. |
| `ttfa_mode` | `not_measured_batch_api`; prevents a batch duration being mislabeled as TTFA. |

Do not delete failed rows. Diagnose and explain them in the final report, then
run a clean, separately named retry if needed.

## Evaluate and collect listener evidence

### Objective evaluation

After every expected condition has measured clips, run forced-language ASR and
speaker embedding evaluation, then prepare listening sheets and aggregate the
results:

```bash
CONFIG=configs/benchmark.yaml

conda run -n infinia-eval python src/evaluate.py --config "$CONFIG"
conda run -n infinia-eval python src/make_listening_sheet.py --config "$CONFIG"
# Collect human ratings as described below.
conda run -n infinia-eval python src/aggregate_results.py --config "$CONFIG"
conda run -n infinia-eval python -m pytest tests/test_normalization.py
```

`evaluate.py` uses the configured Faster-Whisper model (`large-v3-turbo`) with
the prompt language forced, and the configured SpeechBrain ECAPA model for
embedding cosine. It scores the input and ASR transcript with the project’s
Unicode-aware normalization: English is lower-cased; Arabic diacritics and
tatweel are removed and Arabic digits normalized; Devanagari marks are
retained. This is a round-trip intelligibility measure, not an independent
human transcription study.

The evaluator writes `eval/objective_metrics.csv`. Review `status` and `error`
columns before aggregation—an evaluation failure is missing evidence, not a
zero score.

### Blinded human listening protocol

`make_listening_sheet.py` creates these files under the selected output root:

- `eval/listening_sheet.csv` — absolute 1–5 naturalness, same-speaker, and
  pronunciation ratings.
- `eval/ab_listening_sheet.csv` — paired A/B naturalness, speaker, and
  pronunciation preferences.
- `eval/*_KEY.csv` — mappings from blind IDs to models. Keep these private
  until data collection closes.

For a defensible study:

1. Share only the non-key sheets, reference audio, and clip paths with
   listeners. Randomize playback order and do not disclose model names.
2. Ask the submitter and several additional listeners to rate all clips using
   the defined scales. Record a stable non-identifying `listener_id`.
3. Save completed absolute ratings as
   `eval/listener_ratings_completed.csv` and paired choices as
   `eval/ab_ratings_completed.csv` in the same output root. Preserve the
   original sheets and keys.
4. Re-run aggregation. It reports MOS, human same-speaker mean, pronunciation,
   listener count, and A/B speaker win rate by language/model.

Use the final `eval/results_summary.csv` as the source for the report table.
Review per-prompt results, especially names/numbers and prosody, before making
a language recommendation. A high cosine alone is not proof of a successful
clone; use it alongside blinded human identity judgments.

### Submission checks

The final validator is intentionally strict about a complete delivery:

```bash
conda run -n infinia-eval python scripts/validate_submission.py
```

It expects the full benchmark artifacts plus `PROJECT.md`, `RUNBOOK_24H.md`,
and `report/REPORT.md`. Those delivery documents are not currently supplied
in this checkout (only `report/REPORT_TEMPLATE.md` is), so create/complete
them before expecting validation to pass. The validator checks linkage and
presence; it does not certify subjective quality.

## Run the local UI

The UI provides on-device generation, a WAV player, per-clip WER/cosine
evaluation, and a lightweight listener form.

```powershell
npm ci
npm run dev
```

Open the local URL printed by Next.js (normally `http://localhost:3000`). It
starts Conda workers by name, so create `infinia-chatterbox`,
`infinia-indicf5`, and `infinia-eval` first. If `conda` is not on the server
process PATH, set `INFINIA_CONDA_EXE` to its executable. IndicF5 is a gated
Hugging Face model: accept its repository terms and place an authorized
`HF_TOKEN` in `.env` before starting Next.js. Without it, Hindi remains
available through the automatic Multilingual V2 fallback.

The Voice Profile card records through the browser microphone. Record a clean
8â€“20 second sample, enter the **exact** spoken transcript, and choose **Use
this voice**. The server converts the recording to mono 24 kHz PCM WAV with
FFmpeg; ensure `ffmpeg` is on PATH or set `INFINIA_FFMPEG_EXE` to its
executable. The active profile is shown in both the Voice Profile and
Generation cards. It conditions English, Hindi, and Arabic UI requests, and
the per-clip speaker-cosine evaluator uses that same profile as its reference.
Choosing **Use project voice** restores `data/references/reference.wav` for
the session.

Only one voice-model worker is intentionally kept on the GPU. Switching
language or model closes the inactive worker before warming the selected one,
which avoids GPU memory exhaustion on the supported laptop hardware. A switch
between Arabic and the Hindi Multilingual V2 fallback reuses the same worker;
the UI may still briefly show a readiness check.

The UI writes to `outputs/ui/`. A new dev/server session clears its three JSONL
evidence logs (`runs.jsonl`, `evaluations.jsonl`, and `ratings.jsonl`) to begin
a comparable session, although older generated WAVs and `references/` voice
profiles remain local. The active profile selection is browser-session state;
record again after a refresh if you need to reactivate a profile. Each run
records its actual `referenceAudio` path in `outputs/ui/runs.jsonl`. Export
anything you need before restarting it. UI telemetry uses a batch API and
therefore also has no TTFA measurement; do not merge it into the formal CLI
results without a documented protocol.

## Artifacts and sample output

### Expected artifact layout

```text
outputs/<run-id>/
├── raw/benchmark.jsonl              # append-only attempt record, including failures
├── audio/<model>/<language>/*.wav   # generated clips for successful rows
└── eval/
    ├── objective_metrics.csv        # ASR text, normalized WER, ECAPA cosine
    ├── listening_sheet.csv          # blinded absolute ratings
    ├── ab_listening_sheet.csv       # blinded pairwise ratings
    ├── *_KEY.csv                    # private blind-ID mappings
    ├── *_ratings_completed.csv      # returned human evidence
    └── results_summary.csv          # aggregate metrics and pass flags
```

Each JSONL row is self-describing: it has a unique `run_id`, model, language,
prompt ID/category/text, repetition/warm-up state, timings, audio location,
status, and any exception text. Keep the JSONL, WAVs, host snapshot, package
snapshot, configuration, and completed rating sheets together for audit.

The interactive UI uses a separate local layout:

```text
outputs/ui/
├── runs.jsonl                 # UI generation telemetry, including referenceAudio
├── evaluations.jsonl          # per-clip WER and speaker cosine
├── ratings.jsonl              # lightweight UI listener entries
├── ui-<language>-<time>.wav   # generated clips
└── references/
    ├── <profile-id>.wav       # browser-recorded profile converted to 24 kHz WAV
    └── <profile-id>.json      # exact transcript and local metadata
```

These UI files are local demonstration evidence, not an automatically blinded
or repeatable formal benchmark run.

### Retained smoke-run examples

These are real rows from the committed English Turbo smoke run, formatted for
readability. They demonstrate the schema and show why the result table above
does not claim target compliance:

```json
{
  "prompt_id": "en_latency",
  "audio_s": 4.16,
  "full_clip_latency_s": 9.671831,
  "rtf": 2.324959,
  "peak_vram_mb": 3116.09,
  "ttfa_s": null,
  "ttfa_mode": "not_measured_batch_api",
  "status": "ok"
}
{
  "prompt_id": "en_names_numbers",
  "audio_s": 5.6,
  "full_clip_latency_s": 3.077703,
  "rtf": 0.54959,
  "peak_vram_mb": 3302.236,
  "status": "ok"
}
```

The associated WAVs are under
`outputs/smoke-turbo-final/audio/chatterbox-turbo/en/`. The prosody clip was
also retained (2.713650 s generation for 5.0 s audio; RTF 0.542730). These
values are illustrative only and should not be compared across hardware.

## Interpretation, limitations, and safety

- **Batch, not streaming.** Current runners synthesize a complete waveform.
  Report full-clip latency; do not claim the 500 ms streaming target or TTFA
  until a streaming implementation captures the first playable chunk.
- **Hardware matters.** Latency, RTF, and VRAM are meaningful only with the
  GPU/driver, package versions, warm-up policy, prompt, and timing method
  recorded. Never compare cold `load_s` with warmed synthesis latency.
- **Arabic and Hindi must stand on their own.** English success does not
  establish multilingual quality. Inspect MSA punctuation/digits/names and
  Devanagari punctuation/names/numbers, then report the per-language outcome.
- **Objective measures have limits.** ASR may make language-specific errors,
  and ECAPA cosine is not an identity guarantee. Use the blinded ratings and
  paired A/B judgments alongside them.
- **Licensing is separate from quality.** Review every upstream model’s terms
  before deployment. In particular, XTTS-v2 is evaluated under CPML terms and
  is not automatically suitable for commercial deployment.
- **Consent is mandatory.** Generate only voices you are authorized to use;
  retain the consent/source record; do not publish credentials, private source
  audio, or listener-identifying information.

## License

This repository is released under the [MIT License](LICENSE). That license does
not replace the licenses and usage terms of the upstream models, packages, or
any reference-audio permissions.
