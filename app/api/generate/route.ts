import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { NextResponse } from "next/server";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const root = process.cwd();
let generationInProgress = false;

function runGenerator(text: string, output: string) {
  const conda = process.env.INFINIA_CONDA_EXE || process.env.CONDA_EXE || (process.platform === "win32" ? "conda.exe" : "conda");
  const script = path.join(root, "src", "generate_turbo.py");
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const child = spawn(conda, ["run", "-n", "infinia-chatterbox", "python", script, "--text", text, "--output", output], { cwd: root, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => resolve({ stdout, stderr, code }));
  });
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
    const result = await runGenerator(text, output);
    const match = result.stdout.match(/INFINIA_RESULT=(\{.*\})/);
    if (result.code !== 0 || !match || !existsSync(output)) {
      const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").slice(-1200);
      return NextResponse.json({ error: detail || "Chatterbox Turbo could not generate audio." }, { status: 500 });
    }
    const generated = JSON.parse(match[1]) as { duration: number };
    return NextResponse.json({ audioUrl: `/api/audio?file=${encodeURIComponent(filename)}`, duration: generated.duration });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Chatterbox Turbo could not start.";
    const hint = detail.includes("ENOENT") ? " Conda was not found; set INFINIA_CONDA_EXE to your conda executable path." : "";
    return NextResponse.json({ error: `${detail}${hint}` }, { status: 500 });
  } finally {
    generationInProgress = false;
  }
}
