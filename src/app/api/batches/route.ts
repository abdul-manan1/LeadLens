import { NextResponse } from "next/server";
import { getLeads, listBatches } from "@/lib/db";
import { computeStats, createBatchFromCsv } from "@/lib/service";

export const runtime = "nodejs";

export async function GET() {
  const batches = await listBatches();
  const withStats = await Promise.all(
    batches.map(async (b) => ({ ...b, stats: computeStats(await getLeads(b.id)) })),
  );
  return NextResponse.json({ batches: withStats });
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const name = (form.get("name") as string | null)?.trim();
    let text: string;
    let fallbackName = "Untitled import";
    if (file instanceof File) {
      if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File too large (10 MB max)." }, { status: 413 });
      text = await file.text();
      fallbackName = file.name.replace(/\.csv$/i, "");
    } else if (typeof form.get("text") === "string") {
      text = form.get("text") as string;
    } else {
      return NextResponse.json({ error: "Upload a CSV file." }, { status: 400 });
    }
    const { batch, warnings } = await createBatchFromCsv(text, name || fallbackName);
    return NextResponse.json({ batch, warnings }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Import failed" }, { status: 400 });
  }
}
