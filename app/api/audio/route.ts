import { existsSync, readFileSync } from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("file") || "";
  const filename = path.basename(requested);
  const file = path.join(process.cwd(), "outputs", "ui", filename);
  if (filename !== requested || !filename.endsWith(".wav") || !existsSync(file)) return new NextResponse("Audio file not found.", { status: 404 });
  return new NextResponse(readFileSync(file), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
}
