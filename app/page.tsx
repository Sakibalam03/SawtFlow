"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pipelineFor, type Language } from "../lib/tts-pipelines";

type Status = "idle" | "processing" | "ready";
type Evaluation = {
  status: "ok" | "error";
  asrText?: string;
  wer?: number;
  speakerCosine?: number;
  error?: string;
};
type RatingSummary = {
  naturalnessMos: number | null;
  ratingsCount: number;
  listenerCount: number;
  sameSpeakerVotes: number;
  sameSpeakerRate: number | null;
};
type Run = {
  runId: string;
  createdAt: string;
  category: string;
  language: Language;
  text: string;
  status: "ok" | "error";
  audioFile?: string;
  audioSeconds?: number;
  generationSeconds?: number;
  fullClipLatencySeconds?: number;
  rtf?: number;
  peakVramMb?: number;
  referenceAudio?: string;
  error?: string;
  evaluation?: Evaluation | null;
  ratings?: RatingSummary;
};
type Metrics = {
  latest:
    (Run & { ratings: RatingSummary; evaluation: Evaluation | null }) | null;
  summary: {
    attemptedRuns: number;
    successfulRuns: number;
    failureRate: number | null;
    medianFullClipSeconds: number | null;
    p95FullClipSeconds: number | null;
    medianRtf: number | null;
    p95Rtf: number | null;
    maxPeakVramMb: number | null;
    meanWer: number | null;
    meanSpeakerCosine: number | null;
  };
  history: Run[];
};
type VoiceProfile = {
  id: string;
  transcript: string;
  audioUrl: string;
};

const profiles = {
  free_text: {
    label: "Free text",
    text: "Welcome to Infinia. Your voice, brought to life in a moment.",
  },
  latency: {
    label: "Latency - short reply",
    text: "Your appointment is confirmed for tomorrow at ten in the morning.",
  },
  names_numbers: {
    label: "Names and numbers",
    text: "Dr. Maya Chen will meet Omar in room 407 at 4:15 PM.",
  },
  prosody: {
    label: "Prosody - question",
    text: "Are you certain? I said Tuesday, not Thursday - please check again.",
  },
} as const;
const languageDefaults: Record<Language, string> = {
  en: profiles.free_text.text,
  hi: "नमस्ते, यह आपकी आवाज़ में हिंदी का एक नमूना है।",
  ar: "مرحباً، هذا نموذج صوتي باللغة العربية بصوتك.",
};
const languageNames: Record<Language, string> = {
  en: "English",
  hi: "Hindi",
  ar: "Arabic",
};

function Icon({
  name,
  size = 20,
}: {
  name:
    "wave" | "spark" | "play" | "stop" | "mic" | "check" | "chart" | "listen";
  size?: number;
}) {
  const paths = {
    wave: <path d="M3 12h2l2.2-7 3.5 14L14 8l2 4h5" />,
    spark: (
      <path d="m12 3 1.8 5.3L19 10l-5.2 1.7L12 17l-1.8-5.3L5 10l5.2-1.7L12 3Z" />
    ),
    play: <path d="m9 6 8 6-8 6V6Z" fill="currentColor" stroke="none" />,
    stop: (
      <rect
        x="7"
        y="7"
        width="10"
        height="10"
        rx="1.5"
        fill="currentColor"
        stroke="none"
      />
    ),
    mic: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M6 11a6 6 0 0 0 12 0M12 17v4M8 21h8" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chart: (
      <>
        <path d="M4 19V5M4 19h16" />
        <path d="m7 15 4-4 3 2 5-6" />
      </>
    ),
    listen: (
      <>
        <path d="M4 14V10a8 8 0 0 1 16 0v4" />
        <path d="M4 14h3v5H5a1 1 0 0 1-1-1v-4ZM20 14h-3v5h2a1 1 0 0 0 1-1v-4Z" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

const fmt = (value: number | null | undefined, digits = 2) =>
  typeof value === "number" ? value.toFixed(digits) : "Pending";
const pass = (
  value: number | null | undefined,
  rule: (value: number) => boolean,
) => (typeof value === "number" ? (rule(value) ? "pass" : "miss") : "pending");

export default function Home() {
  const [profile, setProfile] = useState<keyof typeof profiles>("free_text");
  const [language, setLanguage] = useState<Language>("en");
  const [modelId, setModelId] = useState(() => pipelineFor("en").default);
  const [text, setText] = useState<string>(profiles.free_text.text);
  const [status, setStatus] = useState<Status>("idle");
  const [workerStatus, setWorkerStatus] = useState<
    "warming" | "ready" | "error"
  >("warming");
  const [evaluatorStatus, setEvaluatorStatus] = useState<
    "warming" | "ready" | "error"
  >("warming");
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generationNotice, setGenerationNotice] = useState<string | null>(
    null,
  );
  const [evaluating, setEvaluating] = useState(false);
  const [rating, setRating] = useState({
    listenerId: "",
    naturalness: "",
    speakerJudgment: "unsure",
  });
  const [savingRating, setSavingRating] = useState(false);
  const [recording, setRecording] = useState<Blob | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [referenceTranscript, setReferenceTranscript] = useState("");
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [voiceProfileStatus, setVoiceProfileStatus] = useState<
    "idle" | "recording" | "saving" | "ready" | "error"
  >("idle");
  const [voiceProfileError, setVoiceProfileError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordingChunks = useRef<Blob[]>([]);

  const refreshMetrics = useCallback(async (runId?: string | null) => {
    const response = await fetch(
      `/api/metrics${runId ? `?runId=${encodeURIComponent(runId)}` : ""}`,
      { cache: "no-store" },
    );
    if (response.ok) setMetrics(await response.json());
  }, []);

  useEffect(() => {
    void refreshMetrics();
    void fetch("/api/evaluate", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error();
        setEvaluatorStatus("ready");
      })
      .catch(() => setEvaluatorStatus("error"));
  }, [refreshMetrics]);

  useEffect(() => {
    let cancelled = false;
    setWorkerStatus("warming");
    void fetch(
      `/api/generate?language=${encodeURIComponent(language)}&model=${encodeURIComponent(modelId)}`,
      { cache: "no-store" },
    )
      .then((response) => {
        if (!response.ok) throw new Error();
        if (!cancelled) setWorkerStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setWorkerStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [language, modelId]);

  const generate = async () => {
    if (!text.trim() || status === "processing") return;
    audio.current?.pause();
    setIsPlaying(false);
    setError(null);
    setGenerationNotice(null);
    setStatus("processing");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, category: profile, language, model: modelId, referenceId: voiceProfile?.id }),
      });
      const result = (await response.json()) as {
        runId?: string;
        audioUrl?: string;
        modelId?: string;
        fallbackUsed?: boolean;
        error?: string;
      };
      if (!response.ok || !result.audioUrl || !result.runId)
        throw new Error(result.error || "Audio generation failed.");
      setAudioUrl(result.audioUrl);
      setCurrentRunId(result.runId);
      if (result.fallbackUsed) {
        setGenerationNotice(
          "IndicF5 was unavailable, so Chatterbox Multilingual V2 generated this clip.",
        );
      } else if (result.modelId) {
        const generatedModel = pipelineFor(language).models[result.modelId];
        setGenerationNotice(
          `Generated with ${generatedModel?.label ?? result.modelId} using the ${voiceProfile ? "custom recorded" : "project"} voice reference.`,
        );
      }
      setStatus("ready");
      setWorkerStatus("ready");
      await refreshMetrics(result.runId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Audio generation failed.",
      );
      setStatus("idle");
    }
  };

  const evaluate = async () => {
    if (!currentRunId) return;
    setEvaluating(true);
    setError(null);
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: currentRunId }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "Objective evaluation failed.");
      setEvaluatorStatus("ready");
      await refreshMetrics(currentRunId);
    } catch (evaluationError) {
      setError(
        evaluationError instanceof Error
          ? evaluationError.message
          : "Objective evaluation failed.",
      );
    } finally {
      setEvaluating(false);
    }
  };

  const submitRating = async () => {
    if (!currentRunId) return;
    setSavingRating(true);
    setError(null);
    try {
      const response = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: currentRunId,
          ...rating,
          naturalness: Number(rating.naturalness),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "Could not save listener evidence.");
      setRating((current) => ({ ...current, naturalness: "" }));
      await refreshMetrics(currentRunId);
    } catch (ratingError) {
      setError(
        ratingError instanceof Error
          ? ratingError.message
          : "Could not save listener evidence.",
      );
    } finally {
      setSavingRating(false);
    }
  };

  const startRecording = async () => {
    setVoiceProfileError(null);
    // Starting a new capture intentionally replaces the prior session choice.
    // It cannot be used until the user saves this new recording and transcript.
    setVoiceProfile(null);
    setRecording(null);
    setReferenceTranscript("");
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
      setRecordingUrl(null);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      recordingChunks.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) recordingChunks.current.push(event.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const nextRecording = new Blob(recordingChunks.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });
        if (nextRecording.size) {
          if (recordingUrl) URL.revokeObjectURL(recordingUrl);
          setRecording(nextRecording);
          setRecordingUrl(URL.createObjectURL(nextRecording));
          setVoiceProfileStatus("idle");
        }
      };
      recorder.current = mediaRecorder;
      mediaRecorder.start();
      setVoiceProfileStatus("recording");
    } catch {
      setVoiceProfileStatus("error");
      setVoiceProfileError("Microphone access was not available. Allow it in your browser and try again.");
    }
  };

  const stopRecording = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };

  const saveVoiceProfile = async () => {
    if (!recording || !referenceTranscript.trim()) return;
    setVoiceProfileStatus("saving");
    setVoiceProfileError(null);
    try {
      const form = new FormData();
      form.append("audio", new File([recording], "voice-reference.webm", { type: recording.type || "audio/webm" }));
      form.append("transcript", referenceTranscript.trim());
      const response = await fetch("/api/voice-profile", { method: "POST", body: form });
      const result = (await response.json()) as VoiceProfile & { error?: string };
      if (!response.ok || !result.id || !result.audioUrl) throw new Error(result.error || "Could not save the voice profile.");
      setVoiceProfile({ id: result.id, transcript: result.transcript, audioUrl: result.audioUrl });
      setVoiceProfileStatus("ready");
    } catch (saveError) {
      setVoiceProfileStatus("error");
      setVoiceProfileError(saveError instanceof Error ? saveError.message : "Could not save the voice profile.");
    }
  };

  const useProjectReference = () => {
    setVoiceProfile(null);
    setRecording(null);
    setReferenceTranscript("");
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
      setRecordingUrl(null);
    }
    setVoiceProfileStatus("idle");
    setVoiceProfileError(null);
  };

  const active =
    metrics?.latest?.runId === currentRunId ? metrics.latest : null;
  const languagePipeline = pipelineFor(language);
  const selectedModel =
    languagePipeline.models[modelId] ??
    languagePipeline.models[languagePipeline.default];
  const playAudio = async () => {
    if (!audio.current) return;
    if (isPlaying) {
      audio.current.pause();
      return;
    }
    audio.current.currentTime = 0;
    await audio.current.play();
  };

  return (
    <main className="page evaluation-page">
      <header className="header">
        <a className="brand" href="/">
          <span className="brand-mark">
            <span />
          </span>
          infinia
        </a>
        <span className={`header-note ${workerStatus}`}>
          <i />{" "}
          {workerStatus === "warming"
            ? "Warming voice model"
            : workerStatus === "ready"
              ? "Voice model ready"
              : "Voice model needs attention"}
        </span>
      </header>
      <section className="intro">
        <div className="intro-icon">
          <Icon name="wave" size={26} />
        </div>
        <p>TEXT TO AUDIO - EVALUATION READY</p>
        <h1>Turn words into your voice.</h1>
        <span>
          Generate voice clones, then measure speed, intelligibility,
          speaker similarity, and listener feedback.
        </span>
      </section>

      <div className="workspace-grid">
        <div className="generation-column">
          <section className="studio">
            <div className="studio-header">
              <div>
                <h2>Generation input</h2>
                <p>
                  Choose a profile for comparable evidence, or write your own
                  text.
                </p>
              </div>
              <span>{text.trim().length} characters</span>
            </div>
            <div className="language-switcher">
              <span>Voice language</span>
              <div>
                {(Object.keys(languageNames) as Language[]).map((code) => (
                  <button
                    key={code}
                    className={language === code ? "active" : ""}
                    onClick={() => {
                      setLanguage(code);
                      setModelId(pipelineFor(code).default);
                      setProfile("free_text");
                      setText(languageDefaults[code]);
                      setAudioUrl(null);
                      setCurrentRunId(null);
                      setGenerationNotice(null);
                      if (status === "ready") setStatus("idle");
                    }}
                  >
                    {languageNames[code]}
                  </button>
                ))}
              </div>
            </div>
            <div className="profile-row">
              <label>
                Prompt profile
                <select
                  value={profile}
                  onChange={(event) => {
                    const next = event.target.value as keyof typeof profiles;
                    setProfile(next);
                    setText(
                      language === "en"
                        ? profiles[next].text
                        : languageDefaults[language],
                    );
                    setAudioUrl(null);
                    setCurrentRunId(null);
                    setGenerationNotice(null);
                  }}
                >
                  <option value="free_text">Free text</option>
                  <option value="latency">Latency - short reply</option>
                  <option value="names_numbers">Names and numbers</option>
                  <option value="prosody">Prosody - question</option>
                </select>
              </label>
              <label>
                Voice model
                <select
                  value={modelId}
                  onChange={(event) => {
                    setModelId(event.target.value);
                    setAudioUrl(null);
                    setCurrentRunId(null);
                    setGenerationNotice(null);
                    if (status === "ready") setStatus("idle");
                  }}
                >
                  {Object.entries(languagePipeline.models).map(
                    ([id, model]) => (
                      <option key={id} value={id}>
                        {model.label}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
            <div className={`reference-indicator ${voiceProfile ? "custom" : "project"}`}>
              <Icon name={voiceProfile ? "check" : "mic"} size={14} />
              <span>
                {voiceProfile
                  ? "Custom recorded voice active — applies to English, Hindi, and Arabic."
                  : "Project reference.wav active — record a voice profile to replace it for this session."}
              </span>
            </div>
            <textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setProfile("free_text");
                setAudioUrl(null);
                setCurrentRunId(null);
                setGenerationNotice(null);
                if (status === "ready") setStatus("idle");
              }}
              maxLength={1000}
              aria-label="Text to convert to audio"
            />
            <div className="studio-actions">
              <button
                className="generate"
                onClick={generate}
                disabled={
                  !text.trim() ||
                  status === "processing" ||
                  workerStatus !== "ready"
                }
              >
                {status === "processing" ? (
                  <>
                    <span className="spinner" /> Generating{" "}
                    {languageNames[language]} audio...
                  </>
                ) : workerStatus === "warming" ? (
                  <>
                    <span className="spinner" /> Warming {selectedModel.label}...
                  </>
                ) : workerStatus === "error" ? (
                  <>Voice model unavailable</>
                ) : (
                  <>
                    <Icon name="spark" size={16} /> Generate audio
                  </>
                )}
              </button>
              <span>Up to 1,000 characters</span>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </section>
          {(status === "processing" || active) && <section
            className={`audio-card ${status === "processing" ? "is-processing" : ""} ${isPlaying ? "is-playing" : ""}`}
            aria-live="polite"
          >
            <div className="audio-visual">
              <span className="halo halo-one" />
              <span className="halo halo-two" />
              <div className="mic">
                <Icon name="mic" size={27} />
              </div>
            </div>
            <div className="audio-copy">
              {status === "processing" ? (
                <>
                  <p className="label">
                    {selectedModel.label.toUpperCase()}
                  </p>
                  <h2>Creating your {languageNames[language]} voice sample</h2>
                  <span>Your voice model is generating audio...</span>
                  <div className="loading-wave">
                    {Array.from({ length: 18 }).map((_, index) => (
                      <i key={index} />
                    ))}
                  </div>
                </>
              ) : active ? (
                <>
                  <p className="label ready-label">
                    <Icon name="check" size={13} /> AUDIO READY
                  </p>
                  <h2>
                    {isPlaying
                      ? "Playing your voice sample"
                      : "Your voice sample is ready"}
                  </h2>
                  <span>
                    <b>Audio length:</b> {fmt(active.audioSeconds)} s <em>-</em>{" "}
                    <b>Generated in:</b> {fmt(active.generationSeconds)} s
                  </span>
                  {generationNotice && <span>{generationNotice}</span>}
                </>
              ) : (
                <>
                  <p className="label">AUDIO PREVIEW</p>
                  <h2>
                    {workerStatus === "warming"
                      ? `Preparing ${selectedModel.label}`
                      : workerStatus === "error"
                        ? "Voice model needs attention"
                        : "Ready when you are"}
                  </h2>
                  <span>
                    {workerStatus === "warming"
                      ? "Generation will unlock as soon as the selected model is ready."
                      : `Generate ${languageNames[language]} audio with ${selectedModel.label} to create a voice-cloned WAV.`}
                  </span>
                </>
              )}
            </div>
            {audioUrl && (
              <>
                <audio
                  ref={audio}
                  src={audioUrl}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                />
                <button
                  className="play"
                  onClick={() => void playAudio()}
                  aria-label={isPlaying ? "Stop audio" : "Play audio"}
                >
                  {isPlaying ? (
                    <Icon name="stop" size={17} />
                  ) : (
                    <Icon name="play" size={17} />
                  )}
                </button>
              </>
            )}
          </section>}
        </div>

        <aside className="reference-column">
          <section className="voice-profile-panel">
            <p className="label">
              <Icon name="mic" size={14} /> VOICE PROFILE
            </p>
            <h2>Record a voice reference</h2>
            <p>
              Record 8–20 seconds in a quiet room, then enter the exact words
              you said. This profile is used only for this browser session.
            </p>
            <button
              className={`record-button ${voiceProfileStatus === "recording" ? "recording" : ""}`}
              onClick={
                voiceProfileStatus === "recording"
                  ? stopRecording
                  : () => void startRecording()
              }
              disabled={voiceProfileStatus === "saving"}
            >
              <Icon name={voiceProfileStatus === "recording" ? "stop" : "mic"} size={16} />
              {voiceProfileStatus === "recording" ? "Stop recording" : "Record voice"}
            </button>
            {(recordingUrl || voiceProfile?.audioUrl) && (
              <audio
                className="voice-profile-audio"
                controls
                src={recordingUrl || voiceProfile?.audioUrl || undefined}
              />
            )}
            <label className="voice-transcript">
              Exact recorded transcript
              <textarea
                value={referenceTranscript}
                onChange={(event) => setReferenceTranscript(event.target.value)}
                maxLength={1000}
                placeholder="Type exactly what you recorded…"
              />
            </label>
            <button
              className="secondary save-profile"
              onClick={() => void saveVoiceProfile()}
              disabled={
                !recording ||
                referenceTranscript.trim().length < 8 ||
                voiceProfileStatus === "saving" ||
                voiceProfileStatus === "recording"
              }
            >
              {voiceProfileStatus === "saving" ? "Preparing WAV…" : "Use this voice"}
            </button>
            {voiceProfile ? (
              <div className="active-profile">
                <span><Icon name="check" size={13} /> Custom voice active</span>
                <button onClick={useProjectReference}>Use project voice</button>
              </div>
            ) : (
              <small className="profile-default">
                {recording
                  ? "New recording ready — enter its transcript, then click Use this voice."
                  : "Project reference voice is active."}
              </small>
            )}
            {voiceProfileError && <p className="error profile-error">{voiceProfileError}</p>}
          </section>
        </aside>

        <aside className="evidence-column">
          <section className="metrics-panel">
            <div className="panel-heading">
              <div>
                <p className="label">
                  <Icon name="chart" size={14} /> EVALUATION
                </p>
                <h2>Evidence for this clip</h2>
              </div>
              {currentRunId && (
                <button
                  className="secondary"
                  onClick={evaluate}
                  disabled={evaluating}
                >
                  {evaluating
                    ? "Evaluating..."
                    : evaluatorStatus === "warming"
                      ? "Evaluator warming..."
                      : "Run objective evaluation"}
                </button>
              )}
            </div>
            <div className="metric-grid objective-metrics">
              <Metric
                title="Naturalness MOS"
                value={
                  active?.ratings.naturalnessMos
                    ? `${fmt(active.ratings.naturalnessMos)}/5`
                    : "Pending"
                }
                note={`${active?.ratings.listenerCount ?? 0} listeners - target >= 4.0`}
                state={pass(
                  active?.ratings.naturalnessMos,
                  (value) => value >= 4,
                )}
              />
              <Metric
                title="Speaker cosine"
                value={
                  active?.evaluation?.speakerCosine
                    ? fmt(active.evaluation.speakerCosine, 3)
                    : "Pending"
                }
                note="ECAPA reference similarity - target >= 0.75"
                state={pass(
                  active?.evaluation?.speakerCosine,
                  (value) => value >= 0.75,
                )}
              />
              <Metric
                title="Round-trip WER"
                value={
                  typeof active?.evaluation?.wer === "number"
                    ? `${(active.evaluation.wer * 100).toFixed(1)}%`
                    : "Pending"
                }
                note="ASR vs input text - target <= 10%"
                state={pass(active?.evaluation?.wer, (value) => value <= 0.1)}
              />
              <Metric
                title="Full-clip latency"
                value={
                  active ? `${fmt(active.fullClipLatencySeconds)} s` : "Pending"
                }
                note="Batch API - target < 2.0 s"
                state={pass(
                  active?.fullClipLatencySeconds,
                  (value) => value < 2,
                )}
              />
              <Metric
                title="Real-time factor"
                value={active ? fmt(active.rtf) : "Pending"}
                note="Generation / audio length - target <= 0.5"
                state={pass(active?.rtf, (value) => value <= 0.5)}
              />
              <Metric
                title="Listener similarity"
                value={
                  active?.ratings.sameSpeakerRate !== null &&
                  active?.ratings.sameSpeakerRate !== undefined
                    ? `${(active.ratings.sameSpeakerRate * 100).toFixed(0)}% same`
                    : "Pending"
                }
                note={`${active?.ratings.ratingsCount ?? 0} listener comparisons`}
                state={active?.ratings.sameSpeakerRate ? "pass" : "pending"}
              />
            </div>
          </section>
          {currentRunId && (
            <section className="listener-panel compact-listener">
              <div className="panel-heading">
                <div>
                  <p className="label">
                    <Icon name="listen" size={14} /> LISTENER EVIDENCE
                  </p>
                  <h2>Quick reference check</h2>
                </div>
                <audio controls src={voiceProfile?.audioUrl || "/api/reference"} />
              </div>
              <div className="compact-rating">
                <input
                  value={rating.listenerId}
                  onChange={(event) =>
                    setRating((current) => ({
                      ...current,
                      listenerId: event.target.value,
                    }))
                  }
                  placeholder="Listener ID"
                />
                <select
                  value={rating.naturalness}
                  onChange={(event) =>
                    setRating((current) => ({
                      ...current,
                      naturalness: event.target.value,
                    }))
                  }
                >
                  <option value="">Naturalness 1-5</option>
                  <option value="1">1 - very artificial</option>
                  <option value="2">2 - mostly artificial</option>
                  <option value="3">3 - acceptable</option>
                  <option value="4">4 - natural</option>
                  <option value="5">5 - very natural</option>
                </select>
                <select
                  value={rating.speakerJudgment}
                  onChange={(event) =>
                    setRating((current) => ({
                      ...current,
                      speakerJudgment: event.target.value,
                    }))
                  }
                >
                  <option value="same">Same speaker</option>
                  <option value="unsure">Unsure</option>
                  <option value="different">Different speaker</option>
                </select>
                <button
                  className="secondary"
                  onClick={submitRating}
                  disabled={
                    savingRating || !rating.listenerId || !rating.naturalness
                  }
                >
                  {savingRating ? "Saving..." : "Save"}
                </button>
              </div>
            </section>
          )}
          <section className="history-panel">
            <div className="panel-heading">
              <div>
                <p className="label">
                  <Icon name="chart" size={14} /> RUN HISTORY
                </p>
                <h2>Current runtime summary</h2>
              </div>
              <span>
                {metrics?.summary.successfulRuns ?? 0} successful /{" "}
                {metrics?.summary.attemptedRuns ?? 0} attempts
              </span>
            </div>
            <div className="summary-grid">
              <Summary
                label="Median / p95 latency"
                value={`${fmt(metrics?.summary.medianFullClipSeconds)} / ${fmt(metrics?.summary.p95FullClipSeconds)} s`}
              />
              <Summary
                label="Median / p95 RTF"
                value={`${fmt(metrics?.summary.medianRtf)} / ${fmt(metrics?.summary.p95Rtf)}`}
              />
              <Summary
                label="Mean WER"
                value={
                  typeof metrics?.summary.meanWer === "number"
                    ? `${(metrics.summary.meanWer * 100).toFixed(1)}%`
                    : "Pending"
                }
              />
              <Summary
                label="Mean speaker cosine"
                value={fmt(metrics?.summary.meanSpeakerCosine, 3)}
              />
              <Summary
                label="Peak GPU memory"
                value={
                  metrics?.summary.maxPeakVramMb
                    ? `${fmt(metrics.summary.maxPeakVramMb, 0)} MB`
                    : "Pending"
                }
              />
              <Summary
                label="Failure rate"
                value={
                  typeof metrics?.summary.failureRate === "number"
                    ? `${(metrics.summary.failureRate * 100).toFixed(0)}%`
                    : "Pending"
                }
              />
            </div>
            <div className="history-list">
              {metrics?.history.length ? (
                metrics.history.map((run) => (
                  <div key={run.runId} className="history-row">
                    <span
                      className={
                        run.status === "ok" ? "dot success" : "dot failure"
                      }
                    />
                    <div>
                      <strong>
                        {languageNames[run.language as Language] ??
                          run.language}{" "}
                        -{" "}
                        {profiles[run.category as keyof typeof profiles]
                          ?.label ?? run.category}
                      </strong>
                      <small>
                        {new Date(run.createdAt).toLocaleString()} -{" "}
                        {run.status === "ok"
                          ? `${fmt(run.fullClipLatencySeconds)} s - RTF ${fmt(run.rtf)}`
                          : run.error}
                      </small>
                    </div>
                    <span>
                      {run.evaluation?.status === "ok"
                        ? `WER ${(run.evaluation.wer! * 100).toFixed(1)}%`
                        : "Not evaluated"}
                    </span>
                  </div>
                ))
              ) : (
                <p className="empty-history">
                  Generate a clip to begin collecting evidence.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
      <p className="footnote">
        <Icon name="mic" size={14} /> Runtime telemetry and objective results
        are stored locally under <code>outputs/ui</code>.
      </p>
    </main>
  );
}

function Metric({
  title,
  value,
  note,
  state,
}: {
  title: string;
  value: string;
  note: string;
  state: "pass" | "miss" | "pending";
}) {
  return (
    <article className={`metric-card ${state}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
