import { NextResponse } from "next/server";
import { processChunk, resetFailedLeads } from "@/lib/service";

export const runtime = "nodejs";
// Each call handles a small chunk so it fits within serverless limits.
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const size = Math.min(10, Math.max(1, Number(url.searchParams.get("size") ?? 4)));
  try {
    if (url.searchParams.get("retry") === "failed") {
      const reset = await resetFailedLeads(id);
      return NextResponse.json({ reset });
    }
    const result = await processChunk(id, size);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Enrichment failed" }, { status: 400 });
  }
}
