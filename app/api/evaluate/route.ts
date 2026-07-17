import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { NextResponse } from "next/server";
import path from "path";
import { metricsFor, root } from "../../../lib/ui-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Startup = { startupSeconds: number };
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
type EvaluatorStore = { child?: ChildProcessWithoutNullStreams; ready?: Promise<Startup>; resolveReady?: (value: Startup) => void; rejectReady?: (error: Error) => void; buffer: string; diagnostics: string[]; pending: Map<string, Pending> };

const globalEvaluator = globalThis as typeof globalThis & { infiniaEvaluator?: EvaluatorStore };
if (!globalEvaluator.infiniaEvaluator) globalEvaluator.infiniaEvaluator = { buffer: "", diagnostics: [], pending: new Map() };
const evaluator = globalEvaluator.infiniaEvaluator;
let evaluationInProgress = false;

function reset(error: Error) {
  evaluator.rejectReady?.(error);
  for (const pending of evaluator.pending.values()) pending.reject(error);
  evaluator.pending.clear(); evaluator.child = undefined; evaluator.ready = undefined;
  evaluator.resolveReady = undefined; evaluator.rejectReady = undefined;
}

function message(payload: { kind?: string; id?: string; error?: string; startupSeconds?: number; evaluation?: unknown }) {
  if (payload.kind === "ready") { evaluator.resolveReady?.({ startupSeconds: payload.startupSeconds || 0 }); evaluator.resolveReady = undefined; evaluator.rejectReady = undefined; return; }
  if (payload.kind === "startup_error") { reset(new Error(payload.error || "Objective evaluator could not start.")); return; }
  if (!payload.id) return;
  const pending = evaluator.pending.get(payload.id); if (!pending) return;
  evaluator.pending.delete(payload.id);
  if (payload.kind === "result") pending.resolve(payload.evaluation); else pending.reject(new Error(payload.error || "Objective evaluation failed."));
}

function output(chunk: Buffer) {
  evaluator.buffer += chunk.toString();
  let newline = evaluator.buffer.indexOf("\n");
  while (newline >= 0) {
    const line = evaluator.buffer.slice(0, newline).trim(); evaluator.buffer = evaluator.buffer.slice(newline + 1);
    if (line.startsWith("INFINIA_EVALUATOR=")) { try { message(JSON.parse(line.slice("INFINIA_EVALUATOR=".length))); } catch { evaluator.diagnostics.push(line); } }
    else if (line) evaluator.diagnostics = [...evaluator.diagnostics, line].slice(-30);
    newline = evaluator.buffer.indexOf("\n");
  }
}

function ensureEvaluator() {
  if (evaluator.ready) return evaluator.ready;
  const conda = process.env.INFINIA_CONDA_EXE || process.env.CONDA_EXE || (process.platform === "win32" ? "conda.exe" : "conda");
  const script = path.join(root, "src", "evaluation_worker.py");
  evaluator.ready = new Promise<Startup>((resolve, reject) => { evaluator.resolveReady = resolve; evaluator.rejectReady = reject; });
  const child = spawn(conda, ["run", "--no-capture-output", "-n", "infinia-eval", "python", script], { cwd: root, windowsHide: true, env: { ...process.env, CUDA_VISIBLE_DEVICES: "-1" } });
  evaluator.child = child;
  child.stdout.on("data", output);
  child.stderr.on("data", chunk => { evaluator.diagnostics = [...evaluator.diagnostics, chunk.toString().trim()].filter(Boolean).slice(-30); });
  child.on("error", reset);
  child.on("close", code => { if (evaluator.child === child) reset(new Error(`Objective evaluator exited with code ${code}.`)); });
  return evaluator.ready;
}

async function evaluateRun(runId: string) {
  await ensureEvaluator();
  if (!evaluator.child) throw new Error("Objective evaluator is unavailable.");
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise<unknown>((resolve, reject) => {
    evaluator.pending.set(id, { resolve, reject });
    evaluator.child?.stdin.write(`${JSON.stringify({ id, runId })}\n`);
  });
}

export async function GET() {
  try { return NextResponse.json({ status: "ready", ...(await ensureEvaluator()) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Objective evaluator could not start." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { runId?: unknown };
  const runId = typeof body.runId === "string" ? body.runId : "";
  const current = runId ? metricsFor(runId).latest : null;
  if (!runId || !current) return NextResponse.json({ error: "Generated run not found." }, { status: 404 });
  if (current.evaluation?.status === "ok") return NextResponse.json(current);
  if (evaluationInProgress) return NextResponse.json({ error: "An objective evaluation is already running." }, { status: 409 });
  evaluationInProgress = true;
  try {
    const result = await evaluateRun(runId) as { status?: string; error?: string };
    if (result.status !== "ok") return NextResponse.json({ error: result.error || "Objective evaluation failed." }, { status: 500 });
    return NextResponse.json(metricsFor(runId).latest);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Objective evaluation failed.";
    const diagnostics = evaluator.diagnostics.join("\n").slice(-1000);
    return NextResponse.json({ error: [detail, diagnostics].filter(Boolean).join("\n") }, { status: 500 });
  } finally { evaluationInProgress = false; }
}
