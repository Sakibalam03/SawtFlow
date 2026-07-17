"use client";

import { useMemo, useState } from "react";

type IconName = "grid" | "wave" | "chart" | "settings" | "play" | "chevron" | "check" | "clock" | "more" | "arrow" | "plus" | "close";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    wave: <><path d="M3 12h2l2.2-7 3.5 14L14 8l2 4h5" /></>,
    chart: <><path d="M4 19V5M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.32 2.32-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-3.28v-.09A1.7 1.7 0 0 0 10.2 19.3a1.7 1.7 0 0 0-1.88.34l-.06.06-2.32-2.32.06-.06A1.7 1.7 0 0 0 6.34 15a1.7 1.7 0 0 0-1.56-1.03H4.7v-3.28h.08A1.7 1.7 0 0 0 6.34 9.66a1.7 1.7 0 0 0-.34-1.88l-.06-.06L8.26 5.4l.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56V4.16h3.28v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.32 2.32-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.08v3.28h-.08A1.7 1.7 0 0 0 19.4 15Z" /></>,
    play: <path d="m9 6 8 6-8 6V6Z" fill="currentColor" stroke="none" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

const models = [
  { name: "Chatterbox Multilingual V3", short: "MTL-V3", langs: "EN · AR · HI", status: "Ready", type: "baseline", color: "navy" },
  { name: "Chatterbox Turbo", short: "TURBO", langs: "EN", status: "Ready", type: "challenger", color: "blue" },
  { name: "XTTS-v2", short: "XTTS", langs: "AR", status: "Ready", type: "challenger", color: "violet" },
  { name: "AI4Bharat IndicF5", short: "F5", langs: "HI", status: "Ready", type: "challenger", color: "rose" },
];

const runs = [
  { prompt: "Your appointment is confirmed for tomorrow at ten in the morning.", label: "Latency test", duration: "4.16s", latency: "9.67s", language: "EN", model: "Chatterbox Turbo", time: "16:51", grade: "Needs review" },
  { prompt: "Dr. Maya Chen will meet Omar in room 407 at 4:15 PM.", label: "Names & numbers", duration: "5.60s", latency: "3.08s", language: "EN", model: "Chatterbox Turbo", time: "16:51", grade: "Pass" },
  { prompt: "Are you certain? I said Tuesday, not Thursday — please check again.", label: "Prosody", duration: "5.00s", latency: "2.71s", language: "EN", model: "Chatterbox Turbo", time: "16:51", grade: "Pass" },
];

export default function Home() {
  const [activeNav, setActiveNav] = useState("Overview");
  const [language, setLanguage] = useState("All languages");
  const [isLaunching, setIsLaunching] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const coverage = useMemo(() => language === "All languages" ? models : models.filter(model => model.langs.includes(language.slice(0, 2).toUpperCase())), [language]);
  const announce = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  };
  const startRun = () => {
    setIsLaunching(true);
    window.setTimeout(() => { setIsLaunching(false); announce("Benchmark run queued. The local pipeline will write results to outputs/."); }, 850);
  };

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><span /></span><span>infinia</span></div>
        <div className="workspace"><span className="workspace-icon">V</span><span>Voice Benchmark</span><button aria-label="Switch workspace"><Icon name="chevron" size={15} /></button></div>
        <nav className="nav" aria-label="Main navigation">
          {[{ label: "Overview", icon: "grid" }, { label: "Runs", icon: "wave" }, { label: "Reports", icon: "chart" }].map(item => (
            <button key={item.label} className={activeNav === item.label ? "active" : ""} onClick={() => { setActiveNav(item.label); announce(`${item.label} view selected.`); }}><Icon name={item.icon as IconName} /><span>{item.label}</span></button>
          ))}
        </nav>
        <div className="side-bottom"><button onClick={() => announce("Settings are managed in configs/benchmark.yaml.")}><Icon name="settings" /><span>Settings</span></button><div className="user"><span className="avatar">AS</span><div><strong>Assignment</strong><small>Local workspace</small></div><Icon name="more" size={18} /></div></div>
      </aside>

      <section className="content">
        <header className="topbar"><div className="crumb">Voice Benchmark <span>/</span> <strong>{activeNav}</strong></div><div className="top-actions"><span className="saved"><Icon name="check" size={14} /> Config saved</span><button className="icon-button" aria-label="More actions" onClick={() => announce("More run options will appear here.")}><Icon name="more" /></button></div></header>

        <div className="page-head"><div><p className="eyebrow">MULTILINGUAL VOICE AI</p><h1>Benchmark overview</h1><p className="subhead">A clear view of local voice-generation runs across English, Arabic and Hindi.</p></div><button className="primary" onClick={startRun} disabled={isLaunching}>{isLaunching ? <span className="spinner" /> : <Icon name="play" size={17} />} {isLaunching ? "Starting run…" : "Run benchmark"}</button></div>

        <section className="metrics" aria-label="Current benchmark metrics">
          <Metric icon="clock" label="Latest run" value="Jul 17, 16:51" note="Chatterbox Turbo · English" />
          <Metric icon="wave" label="Successful clips" value="3 / 3" note="Smoke benchmark output" />
          <Metric icon="chart" label="Median latency" value="3.08 s" note="Full-clip generation" />
          <Metric icon="grid" label="Models ready" value="4" note="Across 3 languages" />
        </section>

        <section className="section-card coverage-card"><div className="section-heading"><div><h2>Model coverage</h2><p>Configured candidates from <code>benchmark.yaml</code></p></div><label className="select-wrap"><span className="sr-only">Filter models by language</span><select value={language} onChange={event => setLanguage(event.target.value)}><option>All languages</option><option>English</option><option>Arabic</option><option>Hindi</option></select></label></div><div className="model-list">{coverage.map(model => <div className="model-row" key={model.name}><span className={`model-badge ${model.color}`}>{model.short}</span><div className="model-name"><strong>{model.name}</strong><span>{model.type}</span></div><span className="languages">{model.langs}</span><span className="ready"><i />{model.status}</span><button aria-label={`View ${model.name}`} className="row-action" onClick={() => announce(`${model.name} is configured for ${model.langs}.`)}><Icon name="chevron" size={17} /></button></div>)}</div></section>

        <section className="lower-grid"><div className="section-card recent-card"><div className="section-heading"><div><h2>Recent audio evidence</h2><p>Latest smoke output</p></div><button className="text-button" onClick={() => announce("All benchmark records are stored in outputs/raw/benchmark.jsonl.")}>View all <Icon name="arrow" size={15} /></button></div><div className="run-list">{runs.map((run, index) => <article className="run" key={run.label}><button className={`play-button ${playing === index ? "is-playing" : ""}`} aria-label={`Play ${run.label}`} onClick={() => { setPlaying(playing === index ? null : index); announce(playing === index ? "Playback paused." : `Preview selected: ${run.label}.`); }}><Icon name={playing === index ? "close" : "play"} size={16} /></button><div className="run-info"><div className="run-title"><strong>{run.label}</strong><span>{run.language}</span><span>·</span><span>{run.model}</span></div><p>{run.prompt}</p><div className="run-meta"><span>{run.duration} audio</span><span>{run.latency} generation</span><span>{run.time}</span></div></div><span className={`grade ${run.grade === "Pass" ? "pass" : "review"}`}>{run.grade}</span></article>)}</div></div>
          <div className="section-card guide-card"><div className="guide-icon"><Icon name="plus" size={20} /></div><h2>Ready to run?</h2><p>Use the consented reference audio and your benchmark configuration to generate a new local run.</p><button className="secondary" onClick={startRun}><Icon name="play" size={15} /> Start a run</button><div className="guide-note"><Icon name="check" size={15} /><span>Reference audio configured</span></div></div></section>
      </section>
      {toast && <div className="toast" role="status"><Icon name="check" size={16} />{toast}</div>}
    </main>
  );
}

function Metric({ icon, label, value, note }: { icon: IconName; label: string; value: string; note: string }) {
  return <article className="metric"><span className="metric-icon"><Icon name={icon} size={19} /></span><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div></article>;
}
