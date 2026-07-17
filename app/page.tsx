"use client";

import { useRef, useState } from "react";

type Status = "idle" | "processing" | "ready";

function Icon({ name, size = 20 }: { name: "wave" | "spark" | "play" | "stop" | "mic" | "check"; size?: number }) {
  const paths = {
    wave: <path d="M3 12h2l2.2-7 3.5 14L14 8l2 4h5" />,
    spark: <path d="m12 3 1.8 5.3L19 10l-5.2 1.7L12 17l-1.8-5.3L5 10l5.2-1.7L12 3Z" />,
    play: <path d="m9 6 8 6-8 6V6Z" fill="currentColor" stroke="none" />,
    stop: <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8 21h8" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function Home() {
  const [text, setText] = useState("Welcome to Infinia. Your voice, brought to life in a moment.");
  const [status, setStatus] = useState<Status>("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);

  const generate = async () => {
    if (!text.trim() || status === "processing") return;
    audio.current?.pause();
    setIsPlaying(false);
    setError(null);
    setStatus("processing");
    try {
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const result = await response.json() as { audioUrl?: string; duration?: number; error?: string };
      if (!response.ok || !result.audioUrl) throw new Error(result.error || "Audio generation failed.");
      setAudioUrl(result.audioUrl);
      setDuration(result.duration ?? null);
      setStatus("ready");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Audio generation failed.");
      setStatus("idle");
    }
  };

  const playAudio = async () => {
    if (!audio.current) return;
    if (isPlaying) { audio.current.pause(); return; }
    audio.current.currentTime = 0;
    await audio.current.play();
  };

  return (
    <main className="page">
      <header className="header"><a className="brand" href="/"><span className="brand-mark"><span /></span>infinia</a><span className="header-note"><i /> Chatterbox Turbo</span></header>
      <section className="intro"><div className="intro-icon"><Icon name="wave" size={26} /></div><p>TEXT TO AUDIO</p><h1>Turn words into your voice.</h1><span>Chatterbox Turbo uses your configured reference recording to generate an English voice clone.</span></section>

      <section className="studio" aria-label="Text to audio studio">
        <div className="studio-header"><div><h2>Your text</h2><p>Type or paste a message below.</p></div><span>{text.trim().length} characters</span></div>
        <textarea value={text} onChange={event => { setText(event.target.value); setAudioUrl(null); setDuration(null); if (status === "ready") setStatus("idle"); }} placeholder="Write something to turn into speech…" maxLength={1000} aria-label="Text to convert to audio" />
        <div className="studio-actions"><button className="generate" onClick={generate} disabled={!text.trim() || status === "processing"}>{status === "processing" ? <><span className="spinner" /> Generating with Turbo…</> : <><Icon name="spark" size={16} /> Generate audio</>}</button><span>Up to 1,000 characters</span></div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      <section className={`audio-card ${status === "processing" ? "is-processing" : ""} ${isPlaying ? "is-playing" : ""}`} aria-live="polite">
        <div className="audio-visual"><span className="halo halo-one" /><span className="halo halo-two" /><div className="mic"><Icon name="mic" size={27} /></div></div>
        <div className="audio-copy">
          {status === "processing" ? <><p className="label">CHATTERBOX TURBO</p><h2>Creating your voice sample</h2><span>Loading the model and conditioning it with your reference recording…</span><div className="loading-wave">{Array.from({ length: 18 }).map((_, index) => <i key={index} />)}</div></> : status === "ready" ? <><p className="label ready-label"><Icon name="check" size={13} /> AUDIO READY</p><h2>{isPlaying ? "Playing your voice sample" : "Your voice sample is ready"}</h2><span>{duration ? `${duration.toFixed(2)} seconds · ` : ""}{isPlaying ? "The microphone lights up during playback." : "Press play to hear Chatterbox Turbo output."}</span></> : <><p className="label">AUDIO PREVIEW</p><h2>Ready when you are</h2><span>Generate audio to create a voice-cloned WAV.</span></>}
        </div>
        {audioUrl && <><audio ref={audio} src={audioUrl} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} onError={() => { setIsPlaying(false); setError("The generated WAV could not be played."); }} /><button className="play" onClick={() => void playAudio()} aria-label={isPlaying ? "Stop audio" : "Play audio"}>{isPlaying ? <Icon name="stop" size={17} /> : <Icon name="play" size={17} />}</button></>}
      </section>

      <p className="footnote"><Icon name="mic" size={14} /> Uses <code>data/references/reference.wav</code> and creates WAV files in <code>outputs/ui</code>.</p>
    </main>
  );
}
