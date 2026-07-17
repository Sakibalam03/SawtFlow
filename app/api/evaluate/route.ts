import { spawn } from "child_process";
import { NextResponse } from "next/server";
import path from "path";
import { metricsFor, root } from "../../../lib/ui-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let evaluating = false;

function runEvaluation(runId: string) {
  const conda = process.env.INFINIA_CONDA_EXE || process.env.CONDA_EXE || (process.platform === "win32" ? "conda.exe" : "conda");
  const script = path.join(root, "src", "evaluate_ui.py");
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const child = spawn(conda, ["run", "-n", "infinia-eval", "python", script, "--run-id", runId], { cwd: root, windowsHide: true, env: { ...process.env, CUDA_VISIBLE_DEVICES: "-1" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => resolve({ stdout, stderr, code }));
  });
}

export async function POST(request: Request) {
  if (evaluating) return NextResponse.json({ error: "An objective evaluation is already running." }, { status: 409 });
  const body = await request.json().catch(() => ({})) as { runId?: unknown };
  const runId = typeof body.runId === "string" ? body.runId : "";
  if (!runId || !metricsFor(runId).latest) return NextResponse.json({ error: "Generated run not found." }, { status: 404 });
  evaluating = true;
  try {
    const result = await runEvaluation(runId);
    const match = result.stdout.match(/INFINIA_EVALUATION=(\{.*\})/);
    if (!match) throw new Error([result.stderr, result.stdout].filter(Boolean).join("\n").slice(-1200) || "Evaluation did not return a result.");
    const evaluation = JSON.parse(match[1]) as { status: string; error?: string };
    if (evaluation.status !== "ok") return NextResponse.json({ error: evaluation.error || "Objective evaluation failed." }, { status: 500 });
    return NextResponse.json(metricsFor(runId).latest);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Objective evaluation failed." }, { status: 500 });
  } finally {
    evaluating = false;
  }
}
