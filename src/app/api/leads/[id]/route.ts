import { NextResponse } from "next/server";
import { z } from "zod";
import { db, getLead } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  status: z.enum(["new", "qualified", "contacted", "rejected"]).optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const lead = await getLead(id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const status = parsed.data.status ?? lead.status;
  const notes = parsed.data.notes === undefined ? lead.notes : parsed.data.notes;
  await db().execute({ sql: "UPDATE leads SET status = ?, notes = ? WHERE id = ?", args: [status, notes, id] });
  return NextResponse.json({ lead: { ...lead, status, notes } });
}
