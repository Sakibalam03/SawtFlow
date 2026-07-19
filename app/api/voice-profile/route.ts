import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { readVoiceProfile, voiceProfilePaths, type VoiceProfile } from "../../../lib/voice-profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function convertToWav(input: string, output: string) {
  const ffmpeg = process.env.INFINIA_FFMPEG_EXE || "ffmpeg";
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpeg, ["-y", "-i", input, "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", output], { windowsHide: true });
    let diagnostics = "";
    child.stderr.on("data", chunk => { diagnostics += chunk.toString(); });
    child.on("error", () => reject(new Error("FFmpeg was not found. Install FFmpeg or set INFINIA_FFMPEG_EXE.")));
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`Could not convert the recording to WAV. ${diagnostics.slice(-500)}`)));
  });
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") || "";
  try {
    const profile = readVoiceProfile(id);
    if (!existsSync(profile.audioPath)) throw new Error("Voice profile audio was not found.");
    return new NextResponse(readFileSync(profile.audioPath), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Voice profile was not found." }, { status: 404 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const recording = form.get("audio");
    const transcript = typeof form.get("transcript") === "string" ? String(form.get("transcript")).trim() : "";
    if (!(recording instanceof File) || !recording.size) throw new Error("Record a voice sample first.");
    if (recording.size > 12 * 1024 * 1024) throw new Error("Voice recording must be 12 MB or smaller.");
    if (transcript.length < 8 || transcript.length > 1_000) throw new Error("Enter the exact recorded transcript (8 to 1,000 characters).");
    const id = randomUUID();
    const paths = voiceProfilePaths(id);
    writeFileSync(paths.source, Buffer.from(await recording.arrayBuffer()));
    try {
      await convertToWav(paths.source, paths.audio);
      const profile: VoiceProfile = { id, transcript, audioPath: paths.audio, createdAt: new Date().toISOString() };
      writeFileSync(paths.metadata, JSON.stringify(profile), "utf8");
      return NextResponse.json({ id, transcript, audioUrl: `/api/voice-profile?id=${encodeURIComponent(id)}` });
    } finally {
      if (existsSync(paths.source)) rmSync(paths.source);
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save the voice profile." }, { status: 400 });
  }
}
