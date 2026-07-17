"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Status = "idle" | "processing" | "ready";
type Evaluation = { status: "ok" | "error"; asrText?: string; wer?: number; speakerCosine?: number; error?: string };
type RatingSummary = { naturalnessMos: number | null; ratingsCount: number; listenerCount: number; sameSpeakerVotes: number; sameSpeakerRate: number | null };
type Run = { runId: string; createdAt: string; category: string; text: string; status: "ok" | "error"; audioFile?: string; audioSeconds?: number; generationSeconds?: number; fullClipLatencySeconds?: number; rtf?: number; peakVramMb?: number; startupSeconds?: number; error?: string; evaluation?: Evaluation | null; ratings?: RatingSummary };
type Metrics = { latest: (Run & { ratings: RatingSummary; evaluation: Evaluation | null }) | null; summary: { attemptedRuns: number; successfulRuns: number; failureRate: number | null; medianFullClipSeconds: number | null; p95FullClipSeconds: number | null; medianRtf: number | null; p95Rtf: number | null; maxPeakVramMb: number | null; meanWer: number | null; meanSpeakerCosine: number | null; evaluatedRuns: number }; history: Run[] };

const profiles = {
  free_text: { label: "Free text", text: "Welcome to Infinia. Your voice, brought to life in a moment." },
  latency: { label: "Latency · short reply", text: "Your appointment is confirmed for tomorrow at ten in the morning." },
  names_numbers: { label: "Names & numbers", text: "Dr. Maya Chen will meet Omar in room 407 at 4:15 PM." },
  prosody: { label: "Prosody · question", text: "Are you certain? I said Tuesday, not Thursday — please check again." },
} as const;

function Icon({ name, size = 20 }: { name: "wave" | "spark" | "play" | "stop" | "mic" | "check" | "chart" | "listen"; size?: number }) {
  const paths = {
    wave: <path d="M3 12h2l2.2-7 3.5 14L14 8l2 4h5" />,
    spark: <path d="m12 3 1.8 5.3L19 10l-5.2 1.7L12 17l-1.8-5.3L5 10l5.2-1.7L12 3Z" />,
    play: <path d="m9 6 8 6-8 6V6Z" fill="currentColor" stroke="none" />,
    stop: <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8 21h8" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chart: <><path d="M4 19V5M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /></>,
    listen: <><path d="M4 14V10a8 8 0 0 1 16 0v4" /><path d="M4 14h3v5H5a1 1 0 0 1-1-1v-4ZM20 14h-3v5h2a1 1 0 0 0 1-1v-4Z" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

const fmt = (value: number | null | undefined, digits = 2) => typeof value === "number" ? value.toFixed(digits) : "Pending";
const pass = (value: number | null | undefined, rule: (value: number) => boolean) => typeof value === "number" ? (rule(value) ? "pass" : "miss") : "pending";

export default function Home() {
  const [profile, setProfile] = useState<keyof typeof profiles>("free_text");
  const [text, setText] = useState<string>(profiles.free_text.text);
  const [status, setStatus] = useState<Status>("idle");
  const [workerStatus, setWorkerStatus] = useState<"warming" | "ready" | "error">("warming");
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [rating, setRating] = useState({ listenerId: "", naturalness: "", speakerJudgment: "unsure", comment: "" });
  const [savingRating, setSavingRating] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);

  const refreshMetrics = useCallback(async (runId?: string | null) => {
    const response = await fetch(`/api/metrics${runId ? `?runId=${encodeURIComponent(runId)}` : ""}`, { cache: "no-store" });
    if (response.ok) setMetrics(await response.json());
  }, []);

  useEffect(() => {
    void refreshMetrics();
    const warmWorker = async () => {
      try { const response = await fetch("/api/generate", { cache: "no-store" }); if (!response.ok) throw new Error(); setWorkerStatus("ready"); }
      catch { setWorkerStatus("error"); }
    };
    void warmWorker();
  }, [refreshMetrics]);

  const generate = async () => {
    if (!text.trim() || status === "processing") return;
    audio.current?.pause(); setIsPlaying(false); setError(null); setStatus("processing");
    try {
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, category: profile }) });
      const result = await response.json() as { runId?: string; audioUrl?: string; error?: string };
      if (!response.ok || !result.audioUrl || !result.runId) throw new Error(result.error || "Audio generation failed.");
      setAudioUrl(result.audioUrl); setCurrentRunId(result.runId); setStatus("ready"); setWorkerStatus("ready"); await refreshMetrics(result.runId);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Audio generation failed."); setStatus("idle"); }
  };

  const evaluate = async () => {
    if (!currentRunId) return;
    setEvaluating(true); setError(null);
    try {
      const response = await fetch("/api/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: currentRunId }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Objective evaluation failed.");
      await refreshMetrics(currentRunId);
    } catch (evaluationError) { setError(evaluationError instanceof Error ? evaluationError.message : "Objective evaluation failed."); }
    finally { setEvaluating(false); }
  };

  const submitRating = async () => {
    if (!currentRunId) return;
    setSavingRating(true); setError(null);
    try {
      const response = await fetch("/api/ratings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: currentRunId, ...rating, naturalness: Number(rating.naturalness) }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save rating.");
      setRating(current => ({ ...current, naturalness: "", comment: "" }));
      await refreshMetrics(currentRunId);
    } catch (ratingError) { setError(ratingError instanceof Error ? ratingError.message : "Could not save rating."); }
    finally { setSavingRating(false); }
  };

  const latest = metrics?.latest;
  const active = latest && latest.runId === currentRunId ? latest : null;
  const playAudio = async () => { if (!audio.current) return; if (isPlaying) { audio.current.pause(); return; } audio.current.currentTime = 0; await audio.current.play(); };

  return <main className="page evaluation-page">
    <header className="header"><a className="brand" href="/"><span className="brand-mark"><span /></span>infinia</a><span className={`header-note ${workerStatus}`}><i /> {workerStatus === "warming" ? "Warming Chatterbox Turbo" : workerStatus === "ready" ? "Chatterbox Turbo ready" : "Turbo needs attention"}</span></header>
    <section className="intro"><div className="intro-icon"><Icon name="wave" size={26} /></div><p>TEXT TO AUDIO · EVALUATION READY</p><h1>Turn words into your voice.</h1><span>Generate English voice clones, then measure speed, intelligibility, speaker similarity, and listener feedback.</span></section>

    <section className="studio"><div className="studio-header"><div><h2>Generation input</h2><p>Choose a profile for comparable evidence, or write your own text.</p></div><span>{text.trim().length} characters</span></div><div className="profile-row"><label>Prompt profile<select value={profile} onChange={event => { const next = event.target.value as keyof typeof profiles; setProfile(next); setText(profiles[next].text); }}><option value="free_text">Free text</option><option value="latency">Latency · short reply</option><option value="names_numbers">Names & numbers</option><option value="prosody">Prosody · question</option></select></label><span>Language: English · Turbo batch mode</span></div><textarea value={text} onChange={event => { setText(event.target.value); setProfile("free_text"); setAudioUrl(null); if (status === "ready") setStatus("idle"); }} maxLength={1000} aria-label="Text to convert to audio" /><div className="studio-actions"><button className="generate" onClick={generate} disabled={!text.trim() || status === "processing" || workerStatus === "warming"}>{status === "processing" ? <><span className="spinner" /> Generating with Turbo…</> : workerStatus === "warming" ? <><span className="spinner" /> Warming voice model…</> : <><Icon name="spark" size={16} /> Generate audio</>}</button><span>Up to 1,000 characters</span></div>{error && <p className="error" role="alert">{error}</p>}</section>

    <section className={`audio-card ${status === "processing" ? "is-processing" : ""} ${isPlaying ? "is-playing" : ""}`} aria-live="polite"><div className="audio-visual"><span className="halo halo-one" /><span className="halo halo-two" /><div className="mic"><Icon name="mic" size={27} /></div></div><div className="audio-copy">{status === "processing" ? <><p className="label">CHATTERBOX TURBO</p><h2>Creating your voice sample</h2><span>Your preloaded voice model is generating audio…</span><div className="loading-wave">{Array.from({ length: 18 }).map((_, index) => <i key={index} />)}</div></> : active ? <><p className="label ready-label"><Icon name="check" size={13} /> AUDIO READY</p><h2>{isPlaying ? "Playing your voice sample" : "Your voice sample is ready"}</h2><span><b>Audio length:</b> {fmt(active.audioSeconds)} s <em>·</em> <b>Generated in:</b> {fmt(active.generationSeconds)} s</span></> : <><p className="label">AUDIO PREVIEW</p><h2>{workerStatus === "warming" ? "Preparing your voice model" : "Ready when you are"}</h2><span>{workerStatus === "warming" ? "Turbo is loading once so future requests are faster." : "Generate audio to create a voice-cloned WAV."}</span></>}</div>{audioUrl && <><audio ref={audio} src={audioUrl} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} /><button className="play" onClick={() => void playAudio()} aria-label={isPlaying ? "Stop audio" : "Play audio"}>{isPlaying ? <Icon name="stop" size={17} /> : <Icon name="play" size={17} />}</button></>}</section>

    <section className="metrics-panel"><div className="panel-heading"><div><p className="label"><Icon name="chart" size={14} /> EVALUATION</p><h2>Evidence for this generated clip</h2></div>{currentRunId && <button className="secondary" onClick={evaluate} disabled={evaluating}>{evaluating ? "Evaluating…" : "Run objective evaluation"}</button>}</div><p className="method-note">Turbo is batch generation: full-clip latency is measured; TTFA is intentionally not reported. Arabic and Hindi remain not evaluated in this English-only UI.</p><div className="metric-grid"><Metric title="Naturalness MOS" value={active?.ratings.naturalnessMos ? `${fmt(active.ratings.naturalnessMos)}/5` : "Pending"} note={`${active?.ratings.listenerCount ?? 0} listeners · target ≥ 4.0`} state={pass(active?.ratings.naturalnessMos, value => value >= 4)} /><Metric title="Speaker cosine" value={active?.evaluation?.speakerCosine ? fmt(active.evaluation.speakerCosine, 3) : "Pending"} note="ECAPA reference similarity · target ≥ 0.75" state={pass(active?.evaluation?.speakerCosine, value => value >= .75)} /><Metric title="Round-trip WER" value={typeof active?.evaluation?.wer === "number" ? `${(active.evaluation.wer * 100).toFixed(1)}%` : "Pending"} note="ASR vs input text · target ≤ 10%" state={pass(active?.evaluation?.wer, value => value <= .10)} /><Metric title="Full-clip latency" value={active ? `${fmt(active.fullClipLatencySeconds)} s` : "Pending"} note="Batch API · target < 2.0 s" state={pass(active?.fullClipLatencySeconds, value => value < 2)} /><Metric title="Real-time factor" value={active ? fmt(active.rtf) : "Pending"} note="Generation ÷ audio length · target ≤ 0.5" state={pass(active?.rtf, value => value <= .5)} /><Metric title="Reference judgment" value={active?.ratings.sameSpeakerRate !== null && active?.ratings.sameSpeakerRate !== undefined ? `${(active.ratings.sameSpeakerRate * 100).toFixed(0)}% same` : "Pending"} note={`${active?.ratings.ratingsCount ?? 0} reference comparisons`} state={active?.ratings.sameSpeakerRate ? "pass" : "pending"} /></div></section>

    {currentRunId && <section className="listener-panel"><div className="panel-heading"><div><p className="label"><Icon name="listen" size={14} /> LISTENER EVIDENCE</p><h2>Rate this clip against the reference</h2></div></div><p>Play the generated clip above, listen to the reference below, then record one independent judgment. This is a direct reference comparison; true blinded A/B model tests become available when a second model is added.</p><audio controls src="/api/reference" /><div className="rating-form"><input value={rating.listenerId} onChange={event => setRating(current => ({ ...current, listenerId: event.target.value }))} placeholder="Listener ID (e.g. listener-01)" /><select value={rating.naturalness} onChange={event => setRating(current => ({ ...current, naturalness: event.target.value }))}><option value="">Naturalness 1–5</option><option value="1">1 · very artificial</option><option value="2">2 · mostly artificial</option><option value="3">3 · acceptable</option><option value="4">4 · natural</option><option value="5">5 · very natural</option></select><select value={rating.speakerJudgment} onChange={event => setRating(current => ({ ...current, speakerJudgment: event.target.value }))}><option value="same">Sounds like same speaker</option><option value="unsure">Unsure</option><option value="different">Sounds like different speaker</option></select><input value={rating.comment} onChange={event => setRating(current => ({ ...current, comment: event.target.value }))} placeholder="Optional comment" /><button className="secondary" onClick={submitRating} disabled={savingRating || !rating.listenerId || !rating.naturalness}>{savingRating ? "Saving…" : "Save rating"}</button></div></section>}

    <section className="history-panel"><div className="panel-heading"><div><p className="label"><Icon name="chart" size={14} /> RUN HISTORY</p><h2>English Turbo summary</h2></div><span>{metrics?.summary.successfulRuns ?? 0} successful / {metrics?.summary.attemptedRuns ?? 0} attempts</span></div><div className="summary-grid"><Summary label="Median / p95 latency" value={`${fmt(metrics?.summary.medianFullClipSeconds)} / ${fmt(metrics?.summary.p95FullClipSeconds)} s`} /><Summary label="Median / p95 RTF" value={`${fmt(metrics?.summary.medianRtf)} / ${fmt(metrics?.summary.p95Rtf)}`} /><Summary label="Mean WER" value={typeof metrics?.summary.meanWer === "number" ? `${(metrics.summary.meanWer * 100).toFixed(1)}%` : "Pending"} /><Summary label="Mean speaker cosine" value={fmt(metrics?.summary.meanSpeakerCosine, 3)} /><Summary label="Peak GPU memory" value={metrics?.summary.maxPeakVramMb ? `${fmt(metrics.summary.maxPeakVramMb, 0)} MB` : "Pending"} /><Summary label="Failure rate" value={typeof metrics?.summary.failureRate === "number" ? `${(metrics.summary.failureRate * 100).toFixed(0)}%` : "Pending"} /></div><div className="history-list">{metrics?.history.length ? metrics.history.map(run => <div key={run.runId} className="history-row"><span className={run.status === "ok" ? "dot success" : "dot failure"} /><div><strong>{profiles[run.category as keyof typeof profiles]?.label ?? run.category}</strong><small>{new Date(run.createdAt).toLocaleString()} · {run.status === "ok" ? `${fmt(run.fullClipLatencySeconds)} s · RTF ${fmt(run.rtf)}` : run.error}</small></div><span>{run.evaluation?.status === "ok" ? `WER ${(run.evaluation.wer! * 100).toFixed(1)}%` : "Not evaluated"}</span></div>) : <p className="empty-history">Generate a clip to begin collecting evidence.</p>}</div></section>
    <p className="footnote"><Icon name="mic" size={14} /> Raw telemetry, objective results, and listener ratings are stored locally under <code>outputs/ui</code>.</p>
  </main>;
}

function Metric({ title, value, note, state }: { title: string; value: string; note: string; state: "pass" | "miss" | "pending" }) { return <article className={`metric-card ${state}`}><span>{title}</span><strong>{value}</strong><small>{note}</small></article>; }
function Summary({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
