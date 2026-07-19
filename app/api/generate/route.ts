import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import {
  modelFor,
  pipelineFor,
  type Language,
  type WorkerKind,
} from "../../../lib/tts-pipelines";
import { appendRun, root, uiOutput } from "../../../lib/ui-evidence";
import {
  readVoiceProfile,
  type VoiceProfile,
} from "../../../lib/voice-profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Startup = {
  loadSeconds: number;
  conditioningSeconds: number;
  startupSeconds: number;
};
type Result = {
  audioDuration: number;
  generationSeconds: number;
  peakVramMb: number | null;
};
type Pending = {
  resolve: (value: Result) => void;
  reject: (reason: Error) => void;
};
type Store = {
  child?: ChildProcessWithoutNullStreams;
  ready?: Promise<Startup>;
  resolveReady?: (value: Startup) => void;
  rejectReady?: (reason: Error) => void;
  buffer: string;
  diagnostics: string[];
  pending: Map<string, Pending>;
  startupStartedAt?: number;
  firstRequest: boolean;
  metrics?: Startup;
};

const workerScripts: Record<WorkerKind, string> = {
  turbo: "turbo_worker.py",
  multilingual: "multilingual_worker.py",
  indicf5: "indicf5_worker.py",
};
const runtimeWorkers = globalThis as typeof globalThis & {
  infiniaVoiceWorkers?: Record<WorkerKind, Store>;
};
if (!runtimeWorkers.infiniaVoiceWorkers) {
  runtimeWorkers.infiniaVoiceWorkers = {
    turbo: { buffer: "", diagnostics: [], pending: new Map(), firstRequest: true },
    multilingual: {
      buffer: "",
      diagnostics: [],
      pending: new Map(),
      firstRequest: true,
    },
    indicf5: {
      buffer: "",
      diagnostics: [],
      pending: new Map(),
      firstRequest: true,
    },
  };
}
const workers = runtimeWorkers.infiniaVoiceWorkers;
let generationInProgress = false;

function reset(kind: WorkerKind, error: Error) {
  const worker = workers[kind];
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

function handle(
  kind: WorkerKind,
  message: {
    kind?: string;
    id?: string;
    error?: string;
    loadSeconds?: number;
    conditioningSeconds?: number;
    audioDuration?: number;
    generationSeconds?: number;
    peakVramMb?: number | null;
  },
) {
  const worker = workers[kind];
  if (message.kind === "ready") {
    const metrics = {
      loadSeconds: message.loadSeconds || 0,
      conditioningSeconds: message.conditioningSeconds || 0,
      startupSeconds: worker.startupStartedAt
        ? (Date.now() - worker.startupStartedAt) / 1000
        : 0,
    };
    worker.metrics = metrics;
    worker.resolveReady?.(metrics);
    worker.resolveReady = undefined;
    worker.rejectReady = undefined;
    return;
  }
  if (message.kind === "startup_error") {
    reset(kind, new Error(message.error || "Voice worker could not start."));
    return;
  }
  if (!message.id) return;
  const pending = worker.pending.get(message.id);
  if (!pending) return;
  worker.pending.delete(message.id);
  message.kind === "result"
    ? pending.resolve({
        audioDuration: message.audioDuration || 0,
        generationSeconds: message.generationSeconds || 0,
        peakVramMb: message.peakVramMb ?? null,
      })
    : pending.reject(new Error(message.error || "Voice generation failed."));
}

function output(kind: WorkerKind, chunk: Buffer) {
  const worker = workers[kind];
  worker.buffer += chunk.toString();
  let newline = worker.buffer.indexOf("\n");
  while (newline >= 0) {
    const line = worker.buffer.slice(0, newline).trim();
    worker.buffer = worker.buffer.slice(newline + 1);
    if (line.startsWith("INFINIA_WORKER=")) {
      try {
        handle(kind, JSON.parse(line.slice("INFINIA_WORKER=".length)));
      } catch {
        worker.diagnostics.push(line);
      }
    } else if (line)
      worker.diagnostics = [...worker.diagnostics, line].slice(-30);
    newline = worker.buffer.indexOf("\n");
  }
}

async function stop(kind: WorkerKind) {
  const worker = workers[kind],
    child = worker.child;
  if (!child) return;
  await new Promise<void>((resolve) => {
    child.once("close", () => resolve());
    try {
      child.stdin.write(`${JSON.stringify({ kind: "shutdown" })}\n`);
    } catch {
      resolve();
    }
  });
}

async function ensure(kind: WorkerKind, environmentName: string) {
  const worker = workers[kind];
  if (worker.ready) return worker.ready;
  // The models share one laptop GPU. Closing every inactive worker prevents an
  // out-of-memory crash while preserving fully independent model pipelines.
  await Promise.all(
    (Object.keys(workerScripts) as WorkerKind[])
      .filter((candidate) => candidate !== kind)
      .map(stop),
  );
  const conda =
    process.env.INFINIA_CONDA_EXE ||
    process.env.CONDA_EXE ||
    (process.platform === "win32" ? "conda.exe" : "conda");
  const environment = { ...process.env };
  if (!environment.HF_TOKEN?.trim()) delete environment.HF_TOKEN;
  worker.startupStartedAt = Date.now();
  worker.ready = new Promise<Startup>((resolve, reject) => {
    worker.resolveReady = resolve;
    worker.rejectReady = reject;
  });
  const child = spawn(
    conda,
    [
      "run",
      "--no-capture-output",
      "-n",
      environmentName,
      "python",
      path.join(root, "src", workerScripts[kind]),
    ],
    { cwd: root, windowsHide: true, env: environment },
  );
  worker.child = child;
  child.stdout.on("data", (chunk) => output(kind, chunk));
  child.stderr.on("data", (chunk) => {
    worker.diagnostics = [...worker.diagnostics, chunk.toString().trim()]
      .filter(Boolean)
      .slice(-30);
  });
  child.on("error", (error) => reset(kind, error));
  child.on("close", (code) => {
    if (worker.child === child)
      reset(kind, new Error(`Voice worker exited with code ${code}.`));
  });
  return worker.ready;
}

async function generate(
  language: Language,
  modelId: string,
  text: string,
  outputFile: string,
  voiceProfile?: VoiceProfile,
) {
  const [, pipeline] = modelFor(language, modelId);
  const worker = workers[pipeline.worker];
  await ensure(pipeline.worker, pipeline.environment);
  if (!worker.child) throw new Error("Voice worker is unavailable.");
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const result = await new Promise<Result>((resolve, reject) => {
    worker.pending.set(id, { resolve, reject });
    worker.child?.stdin.write(
      `${JSON.stringify({ id, text, language, output: outputFile, reference: voiceProfile?.audioPath, referenceTranscript: voiceProfile?.transcript })}\n`,
    );
  });
  const startup = worker.firstRequest ? worker.metrics : undefined;
  worker.firstRequest = false;
  return { ...result, startup };
}

export async function GET(request: NextRequest) {
  const language =
    request.nextUrl.searchParams.get("language") === "ar"
      ? "ar"
      : request.nextUrl.searchParams.get("language") === "hi"
        ? "hi"
        : "en";
  const requestedModel = request.nextUrl.searchParams.get("model") || undefined;
  const languagePipeline = pipelineFor(language);
  if (requestedModel && !languagePipeline.models[requestedModel])
    return NextResponse.json(
      { error: "That model is not available for the selected language." },
      { status: 400 },
    );
  const [modelId, pipeline] = modelFor(language, requestedModel);
  try {
    return NextResponse.json({
      status: "ready",
      language,
      modelId,
      ...(await ensure(pipeline.worker, pipeline.environment)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Voice worker could not start.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (generationInProgress)
    return NextResponse.json(
      { error: "Audio generation is already in progress." },
      { status: 409 },
    );
  const body = (await request.json().catch(() => ({}))) as {
    text?: unknown;
    category?: unknown;
    language?: unknown;
    model?: unknown;
    referenceId?: unknown;
  };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const language: Language =
    body.language === "ar" || body.language === "hi" ? body.language : "en";
  const requestedModel =
    typeof body.model === "string" ? body.model : undefined;
  const referenceId =
    typeof body.referenceId === "string" ? body.referenceId : undefined;
  const languagePipeline = pipelineFor(language);
  if (requestedModel && !languagePipeline.models[requestedModel])
    return NextResponse.json(
      { error: "That model is not available for the selected language." },
      { status: 400 },
    );
  const category =
    typeof body.category === "string" &&
    ["free_text", "latency", "names_numbers", "prosody"].includes(body.category)
      ? body.category
      : "free_text";
  if (!text)
    return NextResponse.json(
      { error: "Enter text to generate audio." },
      { status: 400 },
    );
  if (text.length > 1000)
    return NextResponse.json(
      { error: "Text must be 1,000 characters or fewer." },
      { status: 400 },
    );
  mkdirSync(uiOutput, { recursive: true });
  let [modelId, pipeline] = modelFor(language, requestedModel);
  let voiceProfile: VoiceProfile | undefined;
  if (referenceId) {
    try {
      voiceProfile = readVoiceProfile(referenceId);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Voice profile was not found." },
        { status: 400 },
      );
    }
  }
  const runId = `ui-${language}-${Date.now()}`,
    filename = `${runId}.wav`,
    outputFile = path.join(uiOutput, filename);
  let fallbackUsed = false;
  generationInProgress = true;
  try {
    let result: Awaited<ReturnType<typeof generate>>;
    try {
      result = await generate(language, modelId, text, outputFile, voiceProfile);
    } catch (primaryError) {
      const fallback = !requestedModel && languagePipeline.fallback;
      if (!fallback) throw primaryError;
      [modelId, pipeline] = modelFor(language, fallback);
      fallbackUsed = true;
      result = await generate(language, modelId, text, outputFile, voiceProfile);
    }
    if (!existsSync(outputFile))
      throw new Error("Voice worker completed without creating a WAV.");
    appendRun({
      runId,
      createdAt: new Date().toISOString(),
      model: pipeline.runModel,
      language,
      category,
      text,
      audioFile: filename,
      status: "ok",
      audioSeconds: result.audioDuration,
      generationSeconds: result.generationSeconds,
      fullClipLatencySeconds: result.generationSeconds,
      rtf: result.audioDuration
        ? result.generationSeconds / result.audioDuration
        : undefined,
      peakVramMb: result.peakVramMb,
      ttfaMode: "not_measured_batch_api",
      startupSeconds: result.startup?.startupSeconds,
      referenceAudio: voiceProfile
        ? path.relative(root, voiceProfile.audioPath).replaceAll("\\", "/")
        : "data/references/reference.wav",
    });
    return NextResponse.json({
      runId,
      language,
      model: pipeline.runModel,
      modelId,
      fallbackUsed,
      audioUrl: `/api/audio?file=${encodeURIComponent(filename)}`,
      ...result,
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Voice generation failed.";
    appendRun({
      runId,
      createdAt: new Date().toISOString(),
      model: pipeline.runModel,
      language,
      category,
      text,
      status: "error",
      error: detail,
      ttfaMode: "not_measured_batch_api",
      referenceAudio: voiceProfile
        ? path.relative(root, voiceProfile.audioPath).replaceAll("\\", "/")
        : "data/references/reference.wav",
    });
    return NextResponse.json({ error: detail }, { status: 500 });
  } finally {
    generationInProgress = false;
  }
}
