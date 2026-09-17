import { NextResponse } from "next/server";
import { db, ensureSchema, getBatch, getLeads } from "@/lib/db";
import { computeStats } from "@/lib/service";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const batch = await getBatch(id);
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const leads = await getLeads(id);
  return NextResponse.json({ batch, leads, stats: computeStats(leads) });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await ensureSchema();
  await db().batch(
    [
      { sql: "DELETE FROM leads WHERE batch_id = ?", args: [id] },
      { sql: "DELETE FROM batches WHERE id = ?", args: [id] },
    ],
    "write",
  );
  return NextResponse.json({ ok: true });
}
