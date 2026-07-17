import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { NextResponse } from "next/server";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StartupMetrics = { loadSeconds: number; conditioningSeconds: number; startupSeconds: number };
type PendingRequest = { resolve: (value: { audioDuration: number; generationSeconds: number }) => void; reject: (error: Error) => void };
type WorkerStore = { child?: ChildProcessWithoutNullStreams; ready?: Promise<StartupMetrics>; resolveReady?: (metrics: StartupMetrics) => void; rejectReady?: (error: Error) => void; buffer: string; diagnostics: string[]; pending: Map<string, PendingRequest>; metrics?: StartupMetrics; startupStartedAt?: number; firstRequest: boolean };

const root = process.cwd();
const globalWorker = globalThis as typeof globalThis & { infiniaTurboWorker?: WorkerStore };
if (!globalWorker.infiniaTurboWorker) globalWorker.infiniaTurboWorker = { buffer: "", diagnostics: [], pending: new Map(), firstRequest: true };
const worker: WorkerStore = globalWorker.infiniaTurboWorker;
let generationInProgress = false;

function resetWorker(error: Error) {
  worker.rejectReady?.(error);
  for (const pending of worker.pending.values()) pending.reject(error);
  worker.pending.clear();
  worker.child = undefined;
  worker.ready = undefined;
  worker.resolveReady = undefined;
  worker.rejectReady = undefined;
  worker.metrics = undefined;
  worker.startupStartedAt = undefined;
  worker.firstRequest = true;
}

function handleWorkerMessage(message: { kind?: string; id?: string; error?: string; loadSeconds?: number; conditioningSeconds?: number; audioDuration?: number; generationSeconds?: number }) {
  if (message.kind === "ready") {
    const metrics = { loadSeconds: message.loadSeconds || 0, conditioningSeconds: message.conditioningSeconds || 0, startupSeconds: worker.startupStartedAt ? (Date.now() - worker.startupStartedAt) / 1000 : 0 };
    worker.metrics = metrics;
    worker.resolveReady?.(metrics);
    worker.resolveReady = undefined;
    worker.rejectReady = undefined;
    return;
  }
  if (message.kind === "startup_error") {
    resetWorker(new Error(message.error || "Chatterbox Turbo could not start."));
    return;
  }
  if (!message.id) return;
  const pending = worker.pending.get(message.id);
  if (!pending) return;
  worker.pending.delete(message.id);
  if (message.kind === "result") pending.resolve({ audioDuration: message.audioDuration || 0, generationSeconds: message.generationSeconds || 0 });
  else pending.reject(new Error(message.error || "Chatterbox Turbo could not generate audio."));
}

function handleWorkerOutput(chunk: Buffer) {
  worker.buffer += chunk.toString();
  let newline = worker.buffer.indexOf("\n");
  while (newline >= 0) {
    const line = worker.buffer.slice(0, newline).trim();
    worker.buffer = worker.buffer.slice(newline + 1);
    if (line.startsWith("INFINIA_WORKER=")) {
      try { handleWorkerMessage(JSON.parse(line.slice("INFINIA_WORKER=".length))); } catch { worker.diagnostics.push(line); }
    } else if (line) worker.diagnostics = [...worker.diagnostics, line].slice(-30);
    newline = worker.buffer.indexOf("\n");
  }
}

function ensureWorker() {
  if (worker.ready) return worker.ready;
  const conda = process.env.INFINIA_CONDA_EXE || process.env.CONDA_EXE || (process.platform === "win32" ? "conda.exe" : "conda");
  const script = path.join(root, "src", "turbo_worker.py");
  worker.startupStartedAt = Date.now();
  worker.ready = new Promise<StartupMetrics>((resolve, reject) => { worker.resolveReady = resolve; worker.rejectReady = reject; });
  const child = spawn(conda, ["run", "--no-capture-output", "-n", "infinia-chatterbox", "python", script], { cwd: root, windowsHide: true });
  worker.child = child;
  child.stdout.on("data", handleWorkerOutput);
  child.stderr.on("data", chunk => { worker.diagnostics = [...worker.diagnostics, chunk.toString().trim()].filter(Boolean).slice(-30); });
  child.on("error", error => resetWorker(error));
  child.on("close", code => { if (worker.child === child) resetWorker(new Error(`Chatterbox Turbo worker exited with code ${code}.`)); });
  return worker.ready;
}

async function generate(text: string, output: string) {
  await ensureWorker();
  if (!worker.child) throw new Error("Chatterbox Turbo worker is unavailable.");
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const result = await new Promise<{ audioDuration: number; generationSeconds: number }>((resolve, reject) => {
    worker.pending.set(id, { resolve, reject });
    worker.child?.stdin.write(`${JSON.stringify({ id, text, output })}\n`);
  });
  const startup = worker.firstRequest ? worker.metrics : undefined;
  worker.firstRequest = false;
  return { ...result, startup };
}

export async function GET() {
  try {
    const metrics = await ensureWorker();
    return NextResponse.json({ status: "ready", ...metrics });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chatterbox Turbo could not start.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (generationInProgress) return NextResponse.json({ error: "Audio generation is already in progress." }, { status: 409 });
  const body = await request.json().catch(() => ({})) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Enter text to generate audio." }, { status: 400 });
  if (text.length > 1000) return NextResponse.json({ error: "Text must be 1,000 characters or fewer." }, { status: 400 });

  const outputDir = path.join(root, "outputs", "ui");
  mkdirSync(outputDir, { recursive: true });
  const filename = `voice-${Date.now()}.wav`;
  const output = path.join(outputDir, filename);
  generationInProgress = true;
  try {
    const result = await generate(text, output);
    if (!existsSync(output)) throw new Error("Chatterbox Turbo completed without creating a WAV.");
    return NextResponse.json({ audioUrl: `/api/audio?file=${encodeURIComponent(filename)}`, ...result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Chatterbox Turbo could not generate audio.";
    const hint = detail.includes("ENOENT") ? " Conda was not found; set INFINIA_CONDA_EXE to your conda executable path." : "";
    return NextResponse.json({ error: `${detail}${hint}` }, { status: 500 });
  } finally {
    generationInProgress = false;
  }
}
