import { existsSync, readFileSync } from "fs";
import { NextResponse } from "next/server";
import path from "path";

export const runtime = "nodejs";

export async function GET() {
  const reference = path.join(process.cwd(), "data", "references", "reference.wav");
  if (!existsSync(reference)) return new NextResponse("Reference audio not found.", { status: 404 });
  return new NextResponse(readFileSync(reference), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
}
