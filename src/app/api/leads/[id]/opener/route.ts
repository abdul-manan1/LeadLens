import { NextResponse } from "next/server";
import { generateOpener } from "@/lib/ai";
import { db, getLead } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const lead = await getLead(id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { text, source } = await generateOpener(lead);
  await db().execute({ sql: "UPDATE leads SET opener = ? WHERE id = ?", args: [text, id] });
  return NextResponse.json({ opener: text, source });
}
