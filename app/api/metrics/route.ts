import { NextRequest, NextResponse } from "next/server";
import { metricsFor } from "../../../lib/ui-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return NextResponse.json(metricsFor(request.nextUrl.searchParams.get("runId") || undefined));
}
