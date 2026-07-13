# 24-hour execution runbook

## 0. Before starting

1. Record the submitter's own 8-12 second reference clip and set its exact transcript.
2. Complete `data/references/CONSENT_OR_SOURCE.md`.
3. Confirm the GPU is idle and capture system information in each environment.
4. Verify that no Hugging Face token is stored in project files.

## 1. Installation and smoke tests

1. Create the four Conda environments using `scripts/create_envs.sh`.
2. Run the common Chatterbox V3 baseline first with one measured repetition and no warm-up.
3. Attempt Turbo, XTTS, and IndicF5 with the same smoke parameters.
4. Keep each error output and its JSONL load-failure rows. Bound dependency debugging; do not hide a non-running challenger.

## 2. Full generation

1. Archive smoke output outside `outputs/`, preserving it as evidence when relevant.
2. Start a clean `outputs/raw/benchmark.jsonl` only after the archive is made.
3. Run each worker sequentially with the configured 1 warm-up and 3 measurements per prompt.
4. Inspect successful WAVs immediately for silence, clipping, repetition, truncation, and language drift.
5. Keep all failure rows. On a 4 GB GPU, record OOM conditions rather than retrying with undeclared changes.

## 3. Objective evaluation

1. Run `scripts/run_evals.sh` after all candidate attempts finish.
2. Review every high-WER or low-cosine row against the corresponding WAV.
3. Classify each observed issue as TTS, ASR, orthography/normalization, or integration failure in the final report.

## 4. Human evaluation

1. Give listeners the audio directory plus the two non-key sheets only.
2. Collect ratings from three competent listeners for each rated language.
3. Require anonymized, stable listener IDs and retain duplicate ratings as separate evidence.
4. Do not reveal model labels until all rating sheets are returned.
5. Merge ratings into the completed CSVs, then rerun aggregation.

## 5. Decision and package

1. Select a language winner only after checking evidence completeness, MOS, WER, identity, then latency/RTF and operational constraints.
2. Add one concrete limitation and next engineering step for every language.
3. Complete `report/REPORT.md` with measured values and evidence paths, never estimated values.
4. Run tests and `scripts/validate_submission.py`; explain any validation limitation.
5. Archive source, environments, WAVs, raw/evaluated metrics, ratings, system records, and report. Exclude weights, caches, keys, and secrets.

