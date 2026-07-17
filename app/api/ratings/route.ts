import { NextResponse } from "next/server";
import { appendRating, metricsFor, readRuns } from "../../../lib/ui-evidence";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { runId?: unknown; listenerId?: unknown; naturalness?: unknown; speakerJudgment?: unknown; comment?: unknown };
  const runId = typeof body.runId === "string" ? body.runId : "";
  const listenerId = typeof body.listenerId === "string" ? body.listenerId.trim().slice(0, 80) : "";
  const naturalness = typeof body.naturalness === "number" ? body.naturalness : Number(body.naturalness);
  const speakerJudgment = body.speakerJudgment;
  if (!readRuns().some(run => run.runId === runId && run.status === "ok")) return NextResponse.json({ error: "Generated run not found." }, { status: 404 });
  if (!listenerId) return NextResponse.json({ error: "Enter a listener ID." }, { status: 400 });
  if (!Number.isInteger(naturalness) || naturalness < 1 || naturalness > 5) return NextResponse.json({ error: "Naturalness must be a whole number from 1 to 5." }, { status: 400 });
  if (speakerJudgment !== "same" && speakerJudgment !== "unsure" && speakerJudgment !== "different") return NextResponse.json({ error: "Choose a speaker comparison judgment." }, { status: 400 });
  appendRating({ runId, createdAt: new Date().toISOString(), listenerId, naturalness, speakerJudgment, comment: typeof body.comment === "string" ? body.comment.trim().slice(0, 500) : "" });
  return NextResponse.json(metricsFor(runId).latest?.ratings);
}
