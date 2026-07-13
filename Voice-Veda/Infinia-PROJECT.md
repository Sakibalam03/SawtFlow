# Infinia Multilingual Voice AI Pipeline

**Role:** LLMOps Voice Engineer / Partner trial task  
**Submission track:** Track A — Code, with audio and written evidence included  
**Languages:** English, Modern Standard Arabic, and Hindi  
**Core constraint:** Local/open-weight speech generation; no closed TTS APIs  
**Project status:** Benchmark harness implemented; measured results must be produced on the submitter's hardware  
**Last updated:** 2026-07-15

> **Evidence rule:** This document defines the experiment and submission standard. It does not contain invented MOS, latency, RTF, WER, or speaker-similarity values. Complete result fields only after the corresponding WAV, JSONL, CSV, listener rating, and system record exist.

## Project decision in one page

The project evaluates a **per-language model router** rather than assuming that one TTS model is optimal for English, Arabic, and Hindi.

| Language | Common baseline | Specialist challenger | Decision objective |
|---|---|---|---|
| English | Chatterbox Multilingual V3 | Chatterbox Turbo | Preserve naturalness and cloning while minimizing latency and compute |
| Arabic | Chatterbox Multilingual V3 | XTTS-v2 | Compare a current multilingual baseline with a mature Arabic cloning model |
| Hindi | Chatterbox Multilingual V3 | AI4Bharat IndicF5 | Compare a multilingual baseline with an Indic-specialist model |

The winner for each language is selected using this order:

1. **Evidence completeness:** the pipeline must run, create valid audio, and produce all required metrics.
2. **Quality gates:** naturalness, intelligibility, and speaker identity must meet or approach the targets in Section 3.
3. **Latency:** among models with acceptable quality, prefer lower full-clip latency or genuine streaming TTFA.
4. **Throughput and cost:** use RTF, peak VRAM, load time, and operational complexity as tie-breakers.
5. **Production eligibility:** account for model license, consent requirements, reliability, and maintainability.

The resulting production shape is expected to be:

```text
input text
    │
    ├── language detection / explicit language ID
    │
    ├── language-specific normalization
    │
    ├── model router
    │      ├── English winner
    │      ├── Arabic winner
    │      └── Hindi winner
    │
    ├── isolated model worker
    │
    ├── waveform validation and optional chunking
    │
    └── audio output + latency/quality telemetry
```

---

## 1. Why we're doing this

### 1.1 Problem statement

The case study asks a practical engineering question:

> Which locally deployable, open-source or openly available speech pipeline produces the most human-like cloned voice with the fastest response in English, Arabic, and Hindi?

This is not only a model-quality comparison. It tests the complete LLMOps/VoiceOps workflow:

- finding credible candidate models;
- understanding language coverage and licenses;
- integrating incompatible dependency stacks;
- creating reproducible inference wrappers;
- measuring latency without misleading labels;
- evaluating intelligibility and speaker identity;
- organizing a blinded listening test;
- preserving failures and raw evidence;
- making a production recommendation under time and hardware constraints.

### 1.2 What a successful submission demonstrates

A successful submission shows that the author can:

- run three real language pipelines and produce listenable WAV files;
- benchmark models on named hardware with repeatable commands;
- distinguish model load time, warmed generation time, full-clip latency, and streaming TTFA;
- calculate RTF, round-trip WER, and speaker-embedding cosine similarity;
- conduct a small but valid human listening test;
- compare quality and speed without deciding the winner in advance;
- identify concrete Arabic, Hindi, and English failure modes;
- separate what was demonstrated locally from what is only a proposed production improvement;
- disclose licenses, voice consent, closed tools, and AI assistance honestly.

### 1.3 Primary research question

For each language, the project must answer:

1. Which candidate sounds most natural?
2. Which candidate preserves the reference speaker most reliably?
3. Which candidate is fastest after warm-up?
4. Which candidate has the best quality/latency/VRAM trade-off?
5. Does the candidate satisfy the assignment's target thresholds?
6. Is it legally and operationally suitable for production?

### 1.4 Hypothesis

The working hypothesis is that a **per-language router** will outperform a forced universal model. Chatterbox Multilingual V3 provides a common baseline across all three languages; Turbo, XTTS-v2, and IndicF5 test whether specialist or efficiency-focused alternatives beat that baseline in their strongest target language.

This is a hypothesis, not a conclusion. The final recommendations must follow the attached measurements and listening results.

---

## 2. What we want to build

### 2.1 Required pipelines

The project implements three logical pipelines:

#### English pipeline

```text
English text
  → minimal English normalization
  → Chatterbox Turbo or Chatterbox Multilingual V3
  → cloned English waveform
  → benchmark record
```

#### Arabic pipeline

```text
Modern Standard Arabic text
  → Arabic-aware normalization/evaluation handling
  → Chatterbox Multilingual V3 or XTTS-v2
  → cloned Arabic waveform
  → benchmark record
```

#### Hindi pipeline

```text
Devanagari Hindi text
  → Hindi-safe normalization that preserves combining marks
  → Chatterbox Multilingual V3 or IndicF5
  → cloned Hindi waveform
  → benchmark record
```

The pipelines share prompt loading, timing, audio saving, run IDs, JSONL logging, evaluation, and aggregation code. Model environments remain isolated because their Python, Transformers, Torch, and package constraints can conflict.

### 2.2 Candidate matrix

| Model | Project language(s) | Voice cloning | Role in experiment | Important caveat |
|---|---|---:|---|---|
| Chatterbox Multilingual V3 | English, Arabic, Hindi | Yes | Common multilingual baseline | Current wrapper uses batch generation; no measured streaming TTFA |
| Chatterbox Turbo | English | Yes | English latency/compute challenger | English-only in the official model zoo |
| XTTS-v2 | Arabic | Yes | Mature cross-language Arabic challenger | Model weights use the non-commercial Coqui Public Model License |
| AI4Bharat IndicF5 | Hindi | Yes, with reference transcript | Indic-specialist quality challenger | Requires exact reference transcript and explicit permission for the cloned voice |

### 2.3 Why these candidates

#### Chatterbox Multilingual V3

- One implementation covers all required languages.
- The official Chatterbox project describes V3 as its current general-purpose multilingual model.
- The official language coverage includes English, Arabic, and Hindi.
- It supports zero-shot voice cloning from a short reference.
- Its MIT license makes it comparatively straightforward for a production recommendation.
- It provides the common baseline needed to compare specialist routing against a single-model strategy.

#### Chatterbox Turbo

- It is the official Chatterbox low-compute English model.
- The official model zoo lists a 350M architecture and English support.
- It is the most relevant English latency challenger within the same model family, reducing integration variability.
- It supports paralinguistic tags, which are useful for a later voice-agent study, although tags are not part of the core benchmark prompts.

#### XTTS-v2

- It supports Arabic and cross-language voice cloning.
- It is widely used and provides a mature comparison point.
- It is intentionally limited to Arabic in this benchmark, even though its model card lists other languages, because the 24-hour scope favors one clear specialist comparison per language.
- Its CPML license allows commercial entities to evaluate the model but restricts commercial use of the model and outputs. Therefore, a quality win would not automatically make it the production winner.

#### IndicF5

- It supports Hindi and ten additional Indian languages.
- It is specifically designed for Indian-language TTS.
- It accepts target text, reference audio, and the exact reference transcript.
- The model card is marked MIT and requires explicit permission for cloned voices.
- It is the most relevant Hindi specialist in the limited project scope.

### 2.4 Shared pipeline components

Every model wrapper must perform the same high-level operations:

1. Load `configs/benchmark.yaml`.
2. Seed Python, NumPy, and Torch.
3. validate the reference audio path.
4. Load the model and record model-load duration separately.
5. Filter `data/prompts.csv` by supported language.
6. Run configured warm-ups.
7. Synchronize CUDA immediately before and after each timed inference call.
8. Save mono PCM WAV output.
9. Measure audio duration and calculate RTF.
10. Capture peak allocated CUDA memory where available.
11. Write one immutable JSONL row for every success or failure.

### 2.5 Reference voice policy

The primary benchmark uses one consented reference file:

```text
data/references/reference.wav
```

Requirements:

- Prefer the submitter's own voice.
- Otherwise use an openly licensed speaker with explicit reuse and voice-cloning permission.
- Keep the clip to approximately 8–12 seconds.
- Use a single speaker, low room noise, no music, no reverb, and no clipping.
- Store the exact spoken transcript in `configs/benchmark.yaml`.
- Add a source/consent note in `data/references/`.

Using the same reference clip across all models improves fairness. Using that clip across languages also creates a cross-language cloning stress test. The report must disclose the reference language because accent leakage can affect Arabic/Hindi naturalness, WER, and speaker similarity.

A later production study should add one language-matched reference per language and compare it with the shared-reference condition. That extension is not required for the initial 24-hour benchmark.

### 2.6 Prompt design

The included prompt set contains three prompts per language:

| Category | Purpose |
|---|---|
| `latency` | Short, ordinary sentence used for the assignment's roughly 10-word response benchmark |
| `names_numbers` | Names, room numbers, clock time, and language-specific number realization |
| `prosody` | Punctuation, contrast, hesitation, and question intonation |

Files:

```text
data/prompts.csv
```

The core set produces a focused take-home benchmark, not a publication-grade corpus. Optional expansion tests can cover:

- currency and dates;
- abbreviations and acronyms;
- Arabic diacritized versus undiacritized text;
- Hindi-English code-switching;
- long-form text and paragraph chunking;
- repeated punctuation;
- emotion/paralinguistic controls;
- malformed or empty input.

### 2.7 Project scope and non-goals

#### In scope

- Local TTS generation.
- Zero-shot cloning from a consented reference.
- English, MSA Arabic, and Hindi.
- Four candidate models across six language/model combinations.
- Batch latency measurement for the current wrappers.
- Objective WER and speaker cosine.
- Blinded clip scoring and paired A/B comparisons.
- Reproducibility and licensing notes.

#### Not claimed by the current implementation

- Production-scale streaming.
- Under-500 ms TTFA.
- Dialectal Arabic quality.
- More than one Indic language.
- Fine-tuning.
- Publication-grade MOS.
- Calibrated biometric speaker verification.
- Generalization to arbitrary hardware.
- Commercial suitability of XTTS-v2.

### 2.8 Expected benchmark volume

With all candidates running successfully:

- 6 language/model combinations;
- 3 prompts per combination;
- 1 warm-up per prompt;
- 3 measured repetitions per prompt;
- **18 warm-up generations**;
- **54 measured WAV clips**;
- **18 first-repetition clips** in the absolute listening sheet;
- **9 baseline-versus-challenger A/B pairs**;
- at least 3 ratings per clip/pair where listener availability permits.

---

## 3. What "good" sounds like: metrics and evaluation protocol

This section is the acceptance contract for the project. The listening test matters, but every subjective claim must be traceable to a clip and every numeric claim must be traceable to a raw row.

### 3.1 Target summary

| Metric | Primary statistic | Target | Current evidence source |
|---|---|---:|---|
| Naturalness | Language × model mean MOS | **≥ 4.0 / 5** | `listener_ratings_completed.csv` |
| Speaker similarity | Mean embedding cosine plus human judgment | **≥ 0.75**, or clearly same speaker to listeners | `objective_metrics.csv`, absolute ratings, A/B ratings |
| Latency | Genuine TTFA when streaming; otherwise full-clip latency | **< 500 ms TTFA** or **< 2 s full clip** | `benchmark.jsonl` |
| Real-time factor | Median warmed RTF | **≤ 0.5** | `benchmark.jsonl` |
| Intelligibility | Mean round-trip WER by language × model | **≤ 10%** | `objective_metrics.csv` |
| Cross-language robustness | Every selected language winner passes the applicable bars | **No language below target** | `results_summary.csv` plus prompt-level review |

Additional reported metrics:

- p95 full-clip latency;
- p95 RTF;
- model load time;
- peak allocated VRAM;
- pronunciation rating;
- A/B win rates;
- failure rate and error types;
- names/numbers and prosody observations.

### 3.2 Evaluation principles

The benchmark follows these principles:

#### Same input conditions

Within each language, both candidates receive:

- the same text;
- the same reference audio;
- the same machine and device;
- the same benchmark seed;
- the same warm-up count;
- the same repetition count;
- no concurrent GPU workload where avoidable.

#### Warm and cold measurements are separated

Model load time is recorded separately from inference. Warm-up generations are flagged and excluded from summary statistics. The final report must not combine first-run download/load/compile time with warmed serving latency.

#### CUDA timing is synchronized

GPU operations are asynchronous. The harness calls CUDA synchronization before starting and after ending the timed model call so that the recorded generation interval reflects completed GPU work rather than only Python dispatch time.

#### Failures are retained

A failed run receives a JSONL row with:

- `status = error`;
- exception type and message;
- model, language, prompt, and repetition metadata.

Do not silently remove a candidate because it failed. Preserve the log and explain whether the failure was installation, memory, unsupported text, dependency, or generation related.

#### No benchmark cherry-picking

Use median and p95 over measured runs. Do not report only the fastest repetition. Keep prompt-level rows so poor names/numbers or prosody behavior cannot be hidden by a favorable short prompt.

### 3.3 Naturalness: MOS

#### Definition

Mean Opinion Score estimates how natural and human-like each generated clip sounds.

For a model-language condition with ratings \(r_1, r_2, ..., r_n\):

```text
MOS = (r₁ + r₂ + ... + rₙ) / n
```

#### Rating scale

| Score | Anchor |
|---:|---|
| 5 | Completely natural; could plausibly be a clean recording of a human speaker |
| 4 | Mostly natural; minor synthetic artifact or prosody issue |
| 3 | Understandable but noticeably synthetic or awkward |
| 2 | Multiple distracting artifacts, unnatural rhythm, or pronunciation problems |
| 1 | Severely unnatural, broken, or difficult to listen to |

#### Listening-test protocol

- Use `outputs/eval/listening_sheet.csv`.
- Keep `listening_sheet_KEY.csv` private until ratings are complete.
- Use the first measured repetition for each candidate/prompt to limit listener fatigue and avoid selecting the best take.
- Randomize clip order with a fixed seed.
- Ask listeners to use headphones in a quiet setting where possible.
- Each listener should understand the language being rated. Native or near-native speakers are preferred for Arabic and Hindi.
- Provide the input text so pronunciation and omissions can be judged.
- Provide the reference clip before identity scoring.
- Use anonymized listener IDs.
- Target at least three independent ratings per clip. More listeners improve confidence.
- Do not tell listeners which model produced a clip.

#### Primary reporting

Report MOS by **language × model**, not by model alone. This distinction is essential because one multilingual model can perform differently in English, Arabic, and Hindi.

Required report fields:

- mean MOS;
- number of unique listeners;
- number of clip ratings;
- optional standard deviation or bootstrap confidence interval;
- one representative positive comment;
- one representative negative comment.

#### Bias controls

- Do not let the model author rate clips with access to the model key.
- Do not normalize volume differently by model after generation unless the same operation is applied to every clip.
- Do not exclude a bad clip unless there is a documented technical reason, such as a corrupted file; preserve it in the failure log.
- Avoid rating multiple near-identical repetitions, which can overweight one prompt and reveal model artifacts.

#### Acceptance

The assignment target is:

```text
MOS ≥ 4.0 / 5 for every selected language pipeline
```

If no candidate reaches 4.0 in a language, report the shortfall honestly and select the least-bad candidate only if it is still intelligible and operationally useful.

### 3.4 Speaker similarity: objective cosine and human judgment

#### Objective embedding method

The harness uses `speechbrain/spkrec-ecapa-voxceleb` to encode the reference and generated audio.

Preparation:

1. Load audio.
2. Convert to mono.
3. Resample to 16 kHz.
4. Extract an ECAPA-TDNN speaker embedding.
5. Compare the generated embedding with the reference embedding using cosine similarity.

Formula:

```text
cosine(reference, generated)
    = dot(e_ref, e_gen) / (||e_ref|| × ||e_gen||)
```

Interpretation:

- closer to `1.0` indicates more similar embedding direction;
- the score is useful for relative model comparison;
- it is not a universal biometric threshold across every language, accent, recording condition, or speaker;
- the ECAPA model is trained on VoxCeleb data, so cross-language calibration is limited.

#### Objective reporting

Report by language × model:

- mean speaker cosine;
- minimum speaker cosine across prompts;
- optionally standard deviation;
- prompt with the lowest score;
- whether mean cosine reaches 0.75.

The attached aggregator computes the mean. The per-clip CSV permits calculation of the minimum and dispersion for the report.

#### Absolute human identity score

The clip sheet asks:

```text
same_speaker_1_to_5
```

Suggested anchors:

| Score | Anchor |
|---:|---|
| 5 | Clearly the same person |
| 4 | Probably the same person; minor accent/timbre drift |
| 3 | Uncertain |
| 2 | Probably a different person |
| 1 | Clearly a different person |

#### Paired A/B identity judgment

The harness also creates:

```text
outputs/eval/ab_listening_sheet.csv
```

For each language and prompt, listeners hear:

1. the reference voice;
2. blinded Clip A;
3. blinded Clip B.

They choose `A`, `B`, or `Tie` for speaker similarity. The key remains hidden until all ratings are collected.

Report:

- A/B speaker wins, losses, and ties;
- non-tie win rate;
- any systematic accent or pitch drift;
- whether listeners consistently call the output the same speaker.

#### Acceptance

The target is:

```text
mean speaker cosine ≥ 0.75
```

and/or a clear same-speaker result from human listeners. A high cosine with poor human identity judgment should not be treated as a clean pass. Human and embedding results must be discussed together.

### 3.5 Latency to first audio and full-clip latency

#### Required distinction

**TTFA** is the elapsed time from the synthesis request start until the first playable audio chunk is produced by a streaming path.

**Full-clip latency** is the elapsed time from request start until the complete waveform is returned by a batch path.

These are not interchangeable.

#### Current harness behavior

The current wrappers call batch APIs and receive completed waveforms. Therefore:

```text
ttfa_s = null
```

and:

```text
full_clip_latency_s = generation_s
```

The report must not call the batch value TTFA. It may state that the current implementation did not demonstrate streaming.

#### Measurement boundary

The timed interval includes the local model generation call after the model is loaded. It excludes:

- model download;
- environment creation;
- model initialization/load time;
- WAV writing;
- ASR and evaluation;
- network transport, because generation is local.

CUDA is synchronized around the call.

#### Test prompt

Use the `latency` category prompt in each language. It is designed to approximate the brief's short, roughly ten-word utterance. Report exact text and generated duration so results are interpretable.

#### Summary statistics

Report:

- median warmed full-clip latency;
- p95 warmed full-clip latency;
- model load time separately;
- genuine median/p95 TTFA only if a streaming implementation is added;
- hardware, precision, and software versions.

#### Acceptance

The assignment target is either:

```text
streaming TTFA < 0.5 seconds
```

or:

```text
batch full-clip latency < 2.0 seconds
```

The target must be evaluated on the named local hardware. Vendor-published latency on another GPU is contextual information, not benchmark evidence.

### 3.6 Real-time factor

#### Definition

Real-time factor compares generation duration with output audio duration:

```text
RTF = generation time / generated audio duration
```

Examples:

- `RTF = 0.25`: one second of speech is generated in 0.25 seconds;
- `RTF = 1.00`: generation runs at real time;
- `RTF = 2.00`: generation takes twice the audio duration.

#### Measurement

For each successful run:

```text
rtf = generation_s / audio_s
```

The audio duration is read from the generated waveform length and sample rate.

#### Reporting

Report language × model:

- median RTF;
- p95 RTF;
- prompt-level outliers;
- whether long or prosodic prompts degrade RTF;
- precision and device.

#### Acceptance

```text
median warmed RTF ≤ 0.5
```

RTF and latency answer different questions. A model can have good RTF on long audio but still have poor interaction latency, or produce a short clip quickly but scale poorly with duration. Both metrics remain necessary.

### 3.7 Intelligibility: round-trip WER

#### Definition

Each generated WAV is transcribed by ASR, then the normalized transcript is compared with the normalized input.

Word error rate is:

```text
WER = (substitutions + deletions + insertions) / reference word count
```

#### ASR configuration

The project config uses:

```yaml
asr:
  model: large-v3-turbo
  compute_type: float16
  beam_size: 5
  vad_filter: true
```

The implementation uses faster-whisper and forces the expected language:

- `en` for English;
- `ar` for Arabic;
- `hi` for Hindi.

On CPU, the script falls back from unsupported `float16` to `int8`.

#### Text normalization

Normalization is intentionally Unicode-aware.

Common steps:

1. Unicode NFKC normalization.
2. Lowercasing where applicable.
3. Preserve Unicode letters (`L`), combining marks (`M`), and numbers (`N`).
4. Replace punctuation and symbols with spaces.
5. Collapse repeated whitespace.

Arabic-specific steps:

- remove Arabic diacritics;
- remove tatweel;
- convert Arabic-Indic digits `٠١٢٣٤٥٦٧٨٩` to `0123456789`.

Hindi-specific protection:

- Devanagari vowel signs and other combining marks are preserved because they are Unicode mark characters;
- the normalizer must never strip matras simply because they are not standalone letters.

Unit tests cover English punctuation, Arabic diacritics/digits, and Hindi punctuation.

#### Evidence fields

`objective_metrics.csv` contains:

- original input;
- raw ASR output;
- normalized input;
- normalized ASR output;
- WER;
- model/language/prompt/run IDs.

This makes high WER auditable instead of opaque.

#### Error attribution

Round-trip WER combines TTS and ASR errors. For every high-WER clip, listen and classify the likely source:

- real TTS omission or substitution;
- name/number pronunciation mismatch;
- ASR recognition error despite intelligible audio;
- orthographic variant;
- normalization mismatch;
- truncated or hallucinated output.

Do not silently edit the ASR hypothesis. Corrections belong in commentary, not in the metric file.

#### Acceptance

```text
mean WER ≤ 0.10 per selected language pipeline
```

Also inspect the worst prompt. A low average should not hide a catastrophic names/numbers failure.

#### Optional extension

Character error rate can be useful for Arabic and Hindi orthographic analysis, but it is not part of the current core harness. Add it only if time remains and label it separately from the required WER.

### 3.8 Cross-language robustness

The assignment requires that quality not collapse outside English.

A final router passes this requirement only when the selected English, Arabic, and Hindi pipelines each meet the target bars, or when any shortfall is explicitly disclosed and justified.

Required pass matrix:

| Language | MOS ≥ 4.0 | Cosine ≥ 0.75 / human same speaker | Latency target | RTF ≤ 0.5 | WER ≤ 0.10 | Overall |
|---|---:|---:|---:|---:|---:|---:|
| English | TBD | TBD | TBD | TBD | TBD | TBD |
| Arabic | TBD | TBD | TBD | TBD | TBD | TBD |
| Hindi | TBD | TBD | TBD | TBD | TBD | TBD |

Do not report a global average that allows strong English to compensate for weak Arabic or Hindi.

### 3.9 Pronunciation, names, numbers, and prosody

The listener sheet includes a separate pronunciation score because naturalness can be high even when a name or number is wrong.

Report observations for:

#### English

- name stress and phoneme choice;
- `4:15 PM` realization;
- room-number wording;
- pause and contrast around the em dash;
- question intonation.

#### Arabic

- unvowelled ambiguity;
- case endings or over-vocalization;
- realization of `مئتين وسبعة` and time expressions;
- foreign name pronunciation;
- punctuation-driven pauses;
- MSA consistency versus dialect drift.

#### Hindi

- schwa deletion;
- Nukta characters such as `ख़` and `फ़`;
- number and clock-time realization;
- code-switching tendency for names;
- `गुरुवार` pronunciation;
- Devanagari punctuation and prosody.

The paired A/B sheet includes naturalness, identity, and pronunciation preferences so that a speed winner cannot hide a language-specific pronunciation deficit.

### 3.10 Load time and peak VRAM

These are secondary operational metrics.

#### Model load time

`load_s` measures model construction and checkpoint loading after the Python process starts. Report it separately because it affects cold start and autoscaling but not warmed per-request performance.

#### Peak VRAM

The harness resets PyTorch peak memory statistics before generation and records maximum allocated CUDA memory after the call.

Caveats:

- this is PyTorch allocated memory, not total GPU process memory from `nvidia-smi`;
- lazy allocations can make early runs higher;
- non-PyTorch allocations may not be represented;
- compare models only on the same process strategy and device.

### 3.11 Reliability and failure rate

For each model-language condition, report:

```text
failure rate = failed measured runs / attempted measured runs
```

Classify failures:

- installation/dependency;
- authentication/gated model;
- out-of-memory;
- unsupported language or text;
- runtime exception;
- empty/suspiciously short waveform;
- repetition, hallucination, or truncation;
- invalid audio file.

A model that is slightly faster but intermittently fails should not automatically win a production recommendation.

### 3.12 Statistical reporting

The take-home sample is deliberately small. Use modest language:

- say “in this benchmark on this hardware,” not “universally fastest”;
- report medians and p95 for timing;
- report means and listener counts for MOS;
- preserve prompt-level results;
- avoid significance claims unless an appropriate test is actually run;
- consider bootstrap intervals only as an optional descriptive aid.

### 3.13 Winner-selection policy

The project uses a quality-gated decision rather than a single weighted score.

For each language:

#### Step 1 — Validate evidence

A candidate is eligible only if it has:

- successful measured runs for every required prompt;
- readable audio;
- objective metric rows;
- human ratings where required;
- version and hardware evidence.

#### Step 2 — Apply quality gates

Prefer candidates meeting:

- MOS ≥ 4.0;
- WER ≤ 0.10;
- speaker cosine ≥ 0.75 or clear human identity;
- no catastrophic prompt-level failure.

#### Step 3 — Choose the fastest acceptable candidate

Among quality-acceptable candidates, compare:

1. genuine TTFA if both expose streaming;
2. otherwise median full-clip latency;
3. p95 latency;
4. median and p95 RTF.

#### Step 4 — Apply operational tie-breakers

Consider:

- peak VRAM;
- load time;
- license and commercial eligibility;
- dependency stability;
- ease of serving and observability;
- watermarking/provenance behavior;
- failure rate.

#### Step 5 — Record caveats

Every language recommendation must include one real limitation and one next improvement.

### 3.14 Required Section 3 result table

Populate only from `outputs/eval/results_summary.csv` and prompt-level evidence.

| Language | Model | MOS | Speaker cosine | Human same-speaker | A/B speaker win rate | Full-clip median | Full-clip p95 | TTFA | RTF median | WER | Peak VRAM | Pass? |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| English | Chatterbox Turbo | TBD | TBD | TBD | TBD | TBD | TBD | N/A unless streaming added | TBD | TBD | TBD | TBD |
| English | Chatterbox Multilingual V3 | TBD | TBD | TBD | TBD | TBD | TBD | N/A unless streaming added | TBD | TBD | TBD | TBD |
| Arabic | Chatterbox Multilingual V3 | TBD | TBD | TBD | TBD | TBD | TBD | N/A unless streaming added | TBD | TBD | TBD | TBD |
| Arabic | XTTS-v2 | TBD | TBD | TBD | TBD | TBD | TBD | N/A in current wrapper | TBD | TBD | TBD | TBD |
| Hindi | Chatterbox Multilingual V3 | TBD | TBD | TBD | TBD | TBD | TBD | N/A unless streaming added | TBD | TBD | TBD | TBD |
| Hindi | IndicF5 | TBD | TBD | TBD | TBD | TBD | TBD | N/A in current wrapper | TBD | TBD | TBD | TBD |

---

## 4. Where you might start: discovery and model-selection rationale

The original brief names many valid starting points. The project deliberately limits the implemented benchmark to four candidates so that real audio and complete evidence can be produced within 24 hours.

### 4.1 Models implemented

| Family | Included use |
|---|---|
| Chatterbox | Multilingual V3 baseline across all languages; Turbo English challenger |
| XTTS-v2 | Arabic challenger |
| AI4Bharat IndicF5 | Hindi challenger |

### 4.2 Models considered but not implemented in the core run

| Model/family | Why it is not in the required 24-hour matrix |
|---|---|
| Fish Speech | Strong candidate for a later study, but adds another large integration and licensing/revision surface; published latency on different hardware is not local evidence |
| CosyVoice | Relevant for streaming research, but language/dialect support and integration would require separate validation beyond the constrained benchmark |
| IndexTTS-2 | Interesting emotion-control candidate; not selected because core English/Arabic/Hindi evidence has priority |
| OpenVoice | Useful cloning/style-transfer baseline; omitted to keep two candidates per language |
| Bark | Broad expressive generation but less directly aligned with fast, controlled cloned-voice serving |
| MMS-TTS | Valuable language breadth, especially for fallback research, but not the strongest zero-shot cloning comparison for this experiment |
| Indic Parler-TTS / Indic-TTS | Worth a second Hindi/Indic study; IndicF5 was chosen as the single specialist challenger under the time limit |
| Arabic fine-tunes | Potentially valuable, but each requires dataset, license, dialect, checkpoint, and cloning validation before fair comparison |

These exclusions are project-management decisions, not claims that the excluded models are inferior.

### 4.3 Upgrade path after the take-home

A larger study should add candidates in stages:

1. a genuine streaming model/path for each language;
2. a language-specific Chatterbox pack where available;
3. Fish Speech or CosyVoice where official coverage and licensing fit;
4. one Arabic fine-tune with known dataset provenance;
5. Indic Parler-TTS and at least one more Indian language;
6. long-form and concurrent-load tests.

### 4.4 Model-source and license record

Before submission, capture the exact revision actually downloaded or installed.

| Component | Declared source/license note | Submission action |
|---|---|---|
| Chatterbox repository/models | Official repository is MIT; V3 supports broad multilingual cloning; Turbo is English-focused | Record installed package version and, if installed from Git, commit SHA |
| XTTS-v2 model | Coqui Public Model License; model and outputs limited to non-commercial uses, with commercial-entity evaluation allowed | Include CPML disclosure; do not recommend as straightforward commercial deployment |
| IndicF5 model | Hugging Face card marked MIT; explicit voice-cloning permission required | Record resolved HF revision and consent note |
| faster-whisper | MIT implementation based on CTranslate2 | Record package/model revision and compute type |
| SpeechBrain ECAPA model | Apache-2.0 model card; VoxCeleb-trained speaker verification embeddings | Record resolved model snapshot |

License notes are engineering disclosures, not legal advice. Review the exact license files included with the versions used.

---

## 5. Deliverables: selected track and evidence package

### 5.1 Selected track

This project selects **Track A — Code**.

Track A is the strongest fit because it permits direct inspection of:

- the three language pipelines;
- dependency isolation;
- raw timing implementation;
- Unicode normalization;
- evaluation scripts;
- generated clips;
- failures and raw metrics;
- reproducibility evidence.

The submission also includes Track B-like audio evidence and a Track C-like report, but code remains the primary artifact.

### 5.2 Required repository contents

```text
infinia-voice-case-study/
├── PROJECT.md
├── README.md
├── RUNBOOK_24H.md
├── LICENSE
├── configs/
│   └── benchmark.yaml
├── data/
│   ├── prompts.csv
│   └── references/
│       ├── reference.wav
│       ├── README.md
│       └── CONSENT_OR_SOURCE.md
├── envs/
│   ├── chatterbox.yml
│   ├── xtts.yml
│   ├── indicf5.yml
│   └── eval.yml
├── scripts/
│   ├── create_envs.sh
│   ├── run_chatterbox.sh
│   ├── run_xtts.sh
│   ├── run_indicf5.sh
│   ├── run_evals.sh
│   ├── capture_system.sh
│   └── validate_submission.py
├── src/
│   ├── common.py
│   ├── run_chatterbox.py
│   ├── run_xtts.py
│   ├── run_indicf5.py
│   ├── evaluate.py
│   ├── make_listening_sheet.py
│   └── aggregate_results.py
├── outputs/
│   ├── audio/
│   ├── raw/benchmark.jsonl
│   └── eval/
│       ├── objective_metrics.csv
│       ├── listening_sheet.csv
│       ├── listening_sheet_KEY.csv
│       ├── listener_ratings_completed.csv
│       ├── ab_listening_sheet.csv
│       ├── ab_listening_sheet_KEY.csv
│       ├── ab_ratings_completed.csv
│       └── results_summary.csv
├── report/
│   └── REPORT_TEMPLATE.md
└── tests/
    └── test_normalization.py
```

Files that are not yet generated should not be replaced with fabricated placeholders in the final archive. The report may use `TBD` while work is in progress, but the submitted report must contain measured values or an explicit failure explanation.

### 5.3 Required evidence by assignment metric

| Requirement | Evidence |
|---|---|
| Naturalness MOS | Completed blinded ratings, key, listener method, summary |
| Speaker similarity | Reference WAV, per-clip cosine, human same-speaker ratings, paired A/B identity preferences |
| Latency | Raw JSONL timing rows, hardware record, median/p95 summary, correct TTFA label |
| RTF | Raw generation/audio durations and summary |
| WER | Input text, ASR transcript, normalized strings, per-clip WER, aggregate |
| Cross-language quality | Separate English, Arabic, and Hindi result rows and pass matrix |
| Models tested and winner | Comparison table and language-specific decision record |
| Failure modes | Error rows/logs plus representative bad clips |
| Reproducibility | Environment files, `pip freeze`, system info, model revisions, commands |
| Consent and ground rules | Reference source/consent note and tool disclosure |

### 5.4 Minimum final report contents

The report should be 2–5 pages excluding appendices and raw tables. It must include:

1. executive recommendation by language;
2. hardware and environment;
3. models and versions;
4. prompt/reference protocol;
5. Section 3 result table;
6. listening observations;
7. real failures;
8. production recommendation;
9. licensing and tool disclosure;
10. links/paths to raw evidence.

### 5.5 Definition of done

The project is complete only when:

- at least one successful pipeline exists for English, Arabic, and Hindi;
- both planned candidates were attempted for each language;
- every successful measured run has a readable WAV and JSONL row;
- WER and speaker cosine are present for every successful measured clip;
- human ratings are completed or a clear limitation is disclosed;
- results are aggregated by language × model;
- no batch latency is mislabeled as TTFA;
- winners are selected from evidence;
- system and dependency records are attached;
- voice consent/source is documented;
- `scripts/validate_submission.py` passes, or any validator limitation is explained.

---

## 6. Ground rules

### 6.1 Core generation

- Core speech must be generated locally with the selected model weights.
- Do not use ElevenLabs, OpenAI, Google, Azure, Amazon Polly, or another closed TTS API for benchmark audio.
- A closed tool may be used for a side task only when it is disclosed and does not replace the required local generation/evaluation evidence.

### 6.2 Open-source versus open-weight disclosure

Do not use “open source” as a blanket label when licenses differ.

- Chatterbox and IndicF5 are evaluated as permissively licensed candidates based on their current official metadata.
- XTTS-v2 is an openly downloadable model under CPML, not a permissive commercial model. Treat it as an evaluation benchmark with a production licensing caveat.
- Preserve the exact license files/links relevant to the downloaded revisions.

### 6.3 Voice consent

- Use the submitter's own voice or an openly licensed reference with explicit permission.
- Do not clone a public figure, colleague, customer, or other identifiable person without consent.
- Keep a written source/consent note.
- Remove unnecessary personal metadata from the WAV before sharing.
- The final report should identify the permission basis without exposing sensitive personal details.

### 6.4 Reproducibility

Record:

- operating system;
- CPU and RAM;
- GPU model and VRAM;
- NVIDIA driver and CUDA versions;
- Python versions;
- package snapshots for each environment;
- model repository IDs and resolved revisions;
- benchmark config;
- prompts;
- reference duration, language, sample rate, and transcript;
- command sequence;
- date/time of run.

Environment YAML files are setup recipes, not sufficient proof of the exact packages that resolved. Attach `pip freeze` outputs.

### 6.5 Honesty and raw evidence

- Never fill result cells before the run exists.
- Do not infer local latency from a model card.
- Do not remove unfavorable clips without explanation.
- Do not hand-correct WER inputs or outputs after seeing the score.
- Do not claim a language is supported merely because a model name suggests multilinguality; demonstrate it.
- Distinguish failed integration from poor model quality.
- State when a target was missed.

### 6.6 AI-assistant disclosure

AI coding and writing assistance is allowed. Disclose its use briefly, for example:

> AI assistance was used for code scaffolding, review, and document editing. All model installations, audio generations, listening tests, and reported measurements were executed or verified by the submitter. No benchmark values were generated by an assistant.

### 6.7 Security and safe handling

- Do not commit Hugging Face tokens or other credentials.
- Do not include model caches or downloaded weights in the submission zip.
- Do not expose unrelated recordings.
- Treat `trust_remote_code=True` as executable third-party code; record the model revision and review it before production.
- Validate input length and file type before production deployment.
- Preserve synthetic-audio provenance or watermarking where supported.

### 6.8 Closed evaluation tools

The current harness uses local open-source evaluation components. If an external service is used for transcription, listening-test hosting, analytics, or writing, list:

- service name;
- exact purpose;
- whether audio/text left the machine;
- whether it influenced a required metric;
- why it was used.

---

## 7. Submission package

> The supplied case-study text references “details in Section 7,” but the provided copy ends at Section 6. This project defines a conservative submission package below. Replace or augment it if Infinia provides additional email or naming instructions.

### 7.1 Archive contents

Include:

- source code;
- environment files;
- `PROJECT.md`, `README.md`, and the completed report;
- generated WAV files for all successful measured conditions;
- consented reference WAV and source note;
- raw benchmark JSONL;
- objective metrics CSV;
- completed absolute and A/B listener ratings;
- result summary CSV;
- system information;
- package snapshots;
- relevant error logs;
- no model weights, caches, secrets, or unrelated audio.

### 7.2 Suggested archive name

```text
infinia-voice-case-study-<your-name>-YYYYMMDD.zip
```

### 7.3 Final archive command

From the directory above the repo:

```bash
zip -r infinia-voice-case-study-<your-name>-YYYYMMDD.zip \
  infinia-voice-case-study \
  -x '*/.git/*' \
     '*/__pycache__/*' \
     '*/.pytest_cache/*' \
     '*/models/*' \
     '*/.cache/*' \
     '*/outputs/eval/speechbrain-ecapa/*'
```

Review the resulting file list before sending.

### 7.4 Suggested email summary

Keep the email brief and evidence-oriented:

- Track A selected.
- English, Arabic, and Hindi pipelines included.
- Name the recommended winner for each language.
- Name the benchmark hardware.
- State whether streaming TTFA was demonstrated or only batch latency.
- Mention one important failure or license caveat.
- Attach the archive.

---

## 8. Repository implementation guide

### 8.1 Configuration

`configs/benchmark.yaml` controls:

- random seed;
- measured repetitions;
- warm-up count;
- device;
- reference audio and transcript;
- model enablement/configuration;
- ASR model and decoding;
- speaker embedding model.

Required manual edit:

```yaml
reference_transcript: "EXACT WORDS SPOKEN IN reference.wav"
```

IndicF5 will fail early when this remains the placeholder.

### 8.2 Environment strategy

Separate Conda environments reduce dependency conflicts:

| Environment | Purpose |
|---|---|
| `infinia-chatterbox` | Chatterbox Turbo and Multilingual V3 |
| `infinia-xtts` | Coqui TTS / XTTS-v2 |
| `infinia-indicf5` | IndicF5 and its constrained Transformers stack |
| `infinia-eval` | faster-whisper, SpeechBrain, JiWER, aggregation |

Create/update environments:

```bash
bash scripts/create_envs.sh
```

After successful installation, capture exact dependency snapshots. Consider pinning the resolved versions in a final reproducibility commit.

### 8.3 Generation commands

```bash
bash scripts/run_chatterbox.sh
bash scripts/run_xtts.sh
bash scripts/run_indicf5.sh
```

Smoke-test commands with no warm-up and one measured repetition:

```bash
conda run -n infinia-chatterbox python src/run_chatterbox.py \
  --variant mtl-v3 --repetitions 1 --warmup-runs 0

conda run -n infinia-chatterbox python src/run_chatterbox.py \
  --variant turbo --repetitions 1 --warmup-runs 0

conda run -n infinia-xtts python src/run_xtts.py \
  --repetitions 1 --warmup-runs 0

conda run -n infinia-indicf5 python src/run_indicf5.py \
  --repetitions 1 --warmup-runs 0
```

### 8.4 Raw benchmark schema

Each line of `outputs/raw/benchmark.jsonl` follows the `BenchmarkRow` schema:

| Field | Meaning |
|---|---|
| `run_id` | Unique timestamp/model/prompt/repetition identifier |
| `model` | Canonical candidate name |
| `language` | `en`, `ar`, or `hi` |
| `prompt_id` | Prompt identifier from CSV |
| `category` | latency, names/numbers, or prosody |
| `text` | Exact synthesis input |
| `audio_path` | Expected output WAV path |
| `repetition` | Measured repetition number; warm-up rows use `0` |
| `is_warmup` | Exclusion flag for summary |
| `load_s` | Model load time |
| `generation_s` | Synchronized generation-call duration |
| `full_clip_latency_s` | Batch completion latency |
| `ttfa_s` | Real first-chunk time, null in current wrappers |
| `ttfa_mode` | Explicit measurement label |
| `audio_s` | Output duration |
| `rtf` | Generation duration divided by output duration |
| `peak_vram_mb` | Peak PyTorch allocated CUDA memory |
| `sample_rate` | Output sample rate |
| `status` | `ok` or `error` |
| `error` | Exception type/message for failure |
| `created_at_utc` | Audit timestamp |

### 8.5 Audio validation

`save_audio`:

- converts tensors to CPU NumPy arrays;
- requires a mono waveform;
- peak-normalizes only when samples exceed the valid range;
- saves 16-bit PCM;
- returns duration from sample count and sample rate.

The final validator checks that referenced files exist, are readable, and are not suspiciously short.

### 8.6 Objective evaluation

Run:

```bash
bash scripts/run_evals.sh
```

This performs:

1. faster-whisper transcription;
2. Unicode-aware normalization;
3. JiWER calculation;
4. SpeechBrain ECAPA embedding extraction;
5. cosine calculation;
6. absolute listening-sheet creation;
7. paired A/B sheet creation.

### 8.7 Listener files

Distribute copies of:

```text
outputs/eval/listening_sheet.csv
outputs/eval/ab_listening_sheet.csv
outputs/audio/
```

Do not distribute:

```text
outputs/eval/listening_sheet_KEY.csv
outputs/eval/ab_listening_sheet_KEY.csv
```

Combine absolute ratings into:

```text
outputs/eval/listener_ratings_completed.csv
```

Combine paired ratings into:

```text
outputs/eval/ab_ratings_completed.csv
```

Each listener should have a unique anonymized ID. Multiple listeners can produce duplicate `blind_id` or `pair_id` rows; that is expected.

### 8.8 Aggregation

Run:

```bash
conda run -n infinia-eval python src/aggregate_results.py
```

The aggregator reports objective and human results by **language × model**. It includes:

- median load time;
- median/p95 full-clip latency;
- median TTFA when available;
- median/p95 RTF;
- mean WER;
- mean speaker cosine;
- maximum allocated VRAM;
- MOS, identity, and pronunciation means;
- listener counts;
- A/B win/loss/tie statistics when completed files exist;
- assignment target flags.

### 8.9 System capture

Run in each environment, or save the outputs with environment-specific names:

```bash
bash scripts/capture_system.sh
```

Avoid overwriting earlier `system_info.txt` files. Recommended final names:

```text
evidence/system_info_chatterbox.txt
evidence/system_info_xtts.txt
evidence/system_info_indicf5.txt
evidence/system_info_eval.txt
evidence/pip-freeze-chatterbox.txt
...
```

### 8.10 Tests and validation

Run normalization tests:

```bash
conda run -n infinia-eval python -m pytest tests/test_normalization.py
```

Run final validator:

```bash
conda run -n infinia-eval python scripts/validate_submission.py
```

The validator is a minimum file/evidence check, not a substitute for listening to every submitted WAV and reviewing every result row.

---

## 9. Benchmark execution plan

### 9.1 Phase A — Freeze scope and reference

- Use exactly the four planned candidates.
- Record the reference audio.
- Save its exact transcript.
- Confirm consent/source.
- Capture the initial system record.

### 9.2 Phase B — Install and smoke-test

Install Chatterbox first because it can cover all three required languages. Generate one clip per language before spending time on specialist dependencies.

Give each challenger a bounded debugging window. If it cannot run, preserve the error and continue with the common baseline.

### 9.3 Phase C — Full generation

Move smoke-test results aside or delete only the smoke-test JSONL after preserving any relevant errors.

Run one warm-up and three measured repetitions per prompt. Keep the machine idle and do not run candidates concurrently.

### 9.4 Phase D — Objective evaluation

Run WER and speaker similarity. Inspect high-WER and low-cosine clips immediately. Record whether the problem is audible or likely an evaluator limitation.

### 9.5 Phase E — Human evaluation

Collect absolute and A/B ratings. Keep keys hidden. Use listeners competent in each language.

### 9.6 Phase F — Aggregate and decide

Generate `results_summary.csv`, then complete the Section 3 table and winner decision.

### 9.7 Phase G — Report and package

- Complete the report.
- Add exact revisions and licenses.
- Add failure examples.
- Open every WAV.
- Validate paths and metrics.
- Run the submission validator.
- Zip without weights or secrets.

The detailed hour-by-hour schedule is in `RUNBOOK_24H.md`.

---

## 10. Results and decision record

### 10.1 Executive result table

Complete after aggregation:

| Language | Recommended model | Quality outcome | Speed outcome | Production caveat |
|---|---|---|---|---|
| English | TBD | TBD | TBD | TBD |
| Arabic | TBD | TBD | TBD | TBD |
| Hindi | TBD | TBD | TBD | TBD |

### 10.2 Candidate comparison

| Language | Candidate A | Candidate B | Naturalness winner | Identity winner | Intelligibility winner | Latency winner | Final winner |
|---|---|---|---|---|---|---|---|
| English | Chatterbox Multilingual V3 | Chatterbox Turbo | TBD | TBD | TBD | TBD | TBD |
| Arabic | Chatterbox Multilingual V3 | XTTS-v2 | TBD | TBD | TBD | TBD | TBD |
| Hindi | Chatterbox Multilingual V3 | IndicF5 | TBD | TBD | TBD | TBD | TBD |

### 10.3 Required decision narrative per language

For each language, write four short paragraphs:

1. **What won:** name the selected model.
2. **Evidence:** cite MOS, speaker similarity, WER, latency, and RTF.
3. **Why the other model lost:** identify the measured trade-off.
4. **Caveat and next action:** state a real limitation and improvement.

### 10.4 Failure log template

| ID | Model | Language | Prompt | Failure/artifact | Evidence path | Suspected cause | Resolution/next step |
|---|---|---|---|---|---|---|---|
| F-001 | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

Include at least one concrete weakness per language, even when both models technically succeed.

### 10.5 Evidence-linking convention

Use repository-relative paths in the report:

```text
outputs/audio/<model>/<language>/<prompt>_r1.wav
outputs/raw/benchmark.jsonl
outputs/eval/objective_metrics.csv
outputs/eval/results_summary.csv
```

A reviewer should be able to move from a conclusion to a summary row, then to a raw row and actual clip.

---

## 11. Production recommendation beyond the benchmark

The local benchmark proves model behavior under controlled batch inference. A production voice-agent system requires additional engineering.

### 11.1 Language router

Use explicit language metadata when available. Otherwise apply language detection with confidence and route low-confidence or code-switched text to a safe fallback.

Example policy:

```text
if language == en: English winner
elif language == ar: Arabic winner
elif language == hi: Hindi winner
else: supported multilingual fallback or reject with clear error
```

Avoid switching models mid-sentence unless text segmentation and speaker consistency have been tested.

### 11.2 Text normalization layer

Create deterministic, versioned normalizers before TTS:

- number/date/time expansion;
- acronym handling;
- names and pronunciation lexicons;
- Arabic optional diacritization or ambiguity handling;
- Hindi Nukta preservation and code-switch handling;
- punctuation-to-prosody mapping;
- maximum text length and sentence chunking.

Keep evaluation normalization separate from synthesis normalization. Evaluation normalization removes orthographic noise; synthesis normalization changes what the model is asked to say.

### 11.3 Model-worker isolation

Serve each model in a dedicated process/container because dependencies conflict and model weights are large.

Each worker should expose:

- health/readiness;
- model revision;
- language support;
- synthesis endpoint;
- optional streaming endpoint;
- request cancellation;
- metrics;
- bounded queue;
- GPU memory guard.

### 11.4 Streaming

The current project does not prove streaming. A production extension should:

1. use a model/API that yields audio chunks;
2. define the minimum playable chunk;
3. time request start to first chunk availability;
4. include vocoder and serialization time;
5. test chunk gaps and underruns;
6. report p50/p95/p99 TTFA under concurrency;
7. avoid calling text segmentation alone “streaming” when each segment is still generated in full before playback.

### 11.5 Caching

Potential caches:

- normalized text;
- speaker embedding/conditioning latents derived from a validated reference;
- common prompts;
- compiled kernels;
- model warm pools.

Do not cache sensitive reference audio or embeddings without a retention policy.

### 11.6 Observability

Record per request:

- model and revision;
- language;
- normalized character/word count;
- queue time;
- TTFA or full-clip latency;
- generation duration;
- audio duration and RTF;
- peak/current memory;
- failure category;
- cancellation;
- optional ASR spot-check score;
- watermark/provenance status.

### 11.7 Quality monitoring

Production quality monitoring can include:

- sampled round-trip ASR;
- pronunciation lexicon test suite;
- reference-drift checks;
- hallucination/repetition detector;
- silence/clipping checks;
- language-ID check on generated audio transcription;
- periodic human review by language specialists.

### 11.8 Fallbacks

Fallback policy should account for:

- model unavailable/OOM;
- unsupported language;
- invalid reference;
- long input;
- low language confidence;
- license restrictions;
- repeated generation failure.

A fallback may be the multilingual baseline, a non-cloned permissive TTS voice, or a controlled error response. It must not silently route commercial production to a non-commercial model.

### 11.9 Safety and abuse controls

- verified consent for enrolled voices;
- reference-audio ownership checks;
- rate limits;
- audit logs;
- synthetic-audio labeling/provenance;
- blocklists for unauthorized public-figure impersonation;
- retention and deletion controls;
- model-specific watermark preservation.

### 11.10 Scaling tests still required

Before production:

- concurrency at 1, 2, 4, and 8 requests per GPU;
- queueing impact on p95/p99;
- long-text memory and stability;
- worker restart/cold start;
- mixed-language traffic;
- reference-conditioning cache hit/miss;
- GPU fragmentation;
- hour-long soak test;
- cost per generated minute.

---

## 12. Known limitations and likely failure modes

### 12.1 Benchmark-size limitation

Three prompts per language and three repetitions are enough for a take-home demonstration, not a robust language benchmark. Results may change with speaker, domain, text length, dialect, GPU, package revision, and decoding configuration.

### 12.2 Human-test limitation

Three listeners provide directional evidence but weak population-level confidence. Listener language competence, equipment, and fatigue can materially affect MOS.

### 12.3 ASR confounding

Round-trip WER penalizes both TTS and ASR. Arabic orthography, Hindi spelling, names, and numbers can create apparent errors even when listeners understand the audio.

### 12.4 Speaker-model calibration

ECAPA cosine is a relative proxy. The configured model is not calibrated specifically for all Arabic and Hindi accents or for synthetic cross-language speech.

### 12.5 Reference-language leakage

One shared reference improves experimental control but can transfer accent or prosody into another language. This may reduce both naturalness and intelligibility while preserving timbre.

### 12.6 Batch-only timing

The current wrappers return complete waveforms. They do not demonstrate under-500 ms TTFA, smooth chunk cadence, interruption, or real voice-agent responsiveness.

### 12.7 Dependency volatility

Model packages and Hugging Face repositories can change. Unpinned installs may resolve differently later. Exact snapshots must be captured after successful runs.

### 12.8 License mismatch

A model can win audio quality and still lose the production recommendation because its license restricts commercial deployment. XTTS-v2 must be treated this way unless separately licensed.

### 12.9 Likely language-specific failures

#### English

- unusual names;
- abbreviations;
- times/currency;
- over-exaggerated pauses;
- paralinguistic tags leaking into ordinary text.

#### Arabic

- ambiguous unvowelled words;
- foreign names;
- number agreement;
- dialect drift;
- unstable pauses around punctuation;
- accent leakage from a non-Arabic reference.

#### Hindi

- schwa deletion;
- Nukta pronunciation;
- number expansion;
- Hindi-English code-switching;
- missing words or tokens;
- reference transcript mismatch in IndicF5.

#### All models

- hallucinated continuation;
- repeated phrases;
- long-text truncation;
- silence or clipping;
- high first-run latency;
- OOM on smaller GPUs;
- nondeterministic prosody despite fixed seeds.

---

## 13. Reproducibility checklist

### Before generation

- [ ] Reference voice is consented.
- [ ] `reference.wav` opens and is 8–12 seconds.
- [ ] Exact reference transcript is configured.
- [ ] Prompt CSV is unchanged or changes are committed.
- [ ] GPU is idle.
- [ ] System info is captured.
- [ ] Model access terms are accepted where required.

### During generation

- [ ] Smoke test completed for all three languages.
- [ ] Full benchmark JSONL started from a clean or clearly separated file.
- [ ] One warm-up and three measured repetitions used.
- [ ] No concurrent benchmark processes.
- [ ] Failures retained.
- [ ] Every successful WAV is audible and non-empty.

### During evaluation

- [ ] Objective metrics exist for every successful measured clip.
- [ ] High WER clips are manually reviewed.
- [ ] Low cosine clips are manually reviewed.
- [ ] Listener model keys remain hidden.
- [ ] Listeners understand the rated language.
- [ ] Absolute and paired A/B ratings are combined with listener IDs.
- [ ] Aggregation is by language × model.

### Before submission

- [ ] Winner table follows measured evidence.
- [ ] Section 3 target matrix is complete.
- [ ] Batch latency is not labeled TTFA.
- [ ] At least one real failure/weakness is documented per language.
- [ ] Exact package/model revisions are recorded.
- [ ] XTTS-v2 license caveat is explicit.
- [ ] AI/tool disclosure is included.
- [ ] No credentials or model weights are in the archive.
- [ ] Every linked WAV/CSV/JSONL path exists.
- [ ] `validate_submission.py` passes or deviations are explained.
- [ ] Final zip contents are manually reviewed.

---

## 14. References

Use the official source pages as the primary technical references and record the exact revisions used in the final report.

1. [Resemble AI Chatterbox repository](https://github.com/resemble-ai/chatterbox) — model zoo, Multilingual V3, Turbo, installation, examples, MIT license.
2. [Resemble AI Chatterbox Multilingual overview](https://www.resemble.ai/learn/models/chatterbox-multilingual) — language coverage, zero-shot cloning, V3 positioning, license and watermarking notes.
3. [Coqui XTTS-v2 model card](https://huggingface.co/coqui/XTTS-v2) — language list, cloning features, sample rate, and model license.
4. [XTTS-v2 CPML license file](https://huggingface.co/coqui/XTTS-v2/blob/main/LICENSE.txt) — non-commercial model/output terms and evaluation allowance.
5. [AI4Bharat IndicF5 repository](https://github.com/AI4Bharat/IndicF5) — supported Indian languages, installation, and three-input inference interface.
6. [AI4Bharat IndicF5 model card](https://huggingface.co/ai4bharat/IndicF5) — model metadata, license, and voice-permission terms.
7. [SYSTRAN faster-whisper repository](https://github.com/SYSTRAN/faster-whisper) — CTranslate2 Whisper inference and configuration.
8. [SpeechBrain ECAPA-TDNN VoxCeleb model card](https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb) — speaker embeddings, 16 kHz expectations, cosine verification, and limitations.
9. [JiWER documentation/repository](https://github.com/jitsi/jiwer) — WER calculation used by the evaluator.

---

## Appendix A. Final results placeholder

Replace this appendix with exported results or attach the CSV unchanged.

```text
outputs/eval/results_summary.csv
```

No result is valid unless its source run and WAV remain in the submission.

## Appendix B. Tool disclosure placeholder

| Tool | Open/closed | Purpose | Data sent externally | Effect on required metrics |
|---|---|---|---|---|
| Local TTS models | Open-source/open-weight as disclosed | Core generation | None | Direct |
| faster-whisper | Open source | Round-trip ASR | None | Direct |
| SpeechBrain ECAPA | Open source/open model | Speaker embeddings | None | Direct |
| AI coding/writing assistant | Disclose actual tool | Scaffolding/review/editing | Describe actual usage | None; measurements manually executed/verified |

## Appendix C. Decision statement template

> On **[hardware]**, using **[reference description]**, **[model]** was the recommended **[language]** pipeline. It achieved MOS **[x]**, mean speaker cosine **[x]**, median batch latency/TTFA **[x]**, median RTF **[x]**, and WER **[x]**. It won because **[evidence-based reason]**. Its main observed failure was **[specific failure and clip path]**. For production, I would **[specific next engineering action]**.
