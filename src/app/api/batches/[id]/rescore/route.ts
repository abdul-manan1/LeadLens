import { NextResponse } from "next/server";
import { z } from "zod";
import { rescoreBatch } from "@/lib/service";

export const runtime = "nodejs";

const Body = z.object({
  weights: z.object({
    revenue: z.number().min(0).max(100),
    employees: z.number().min(0).max(100),
    maturity: z.number().min(0).max(100),
    owner: z.number().min(0).max(100),
    contactability: z.number().min(0).max(100),
    upside: z.number().min(0).max(100),
    industry: z.number().min(0).max(100),
  }),
  targetIndustries: z.array(z.string().min(1).max(60)).max(100),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid weights" }, { status: 400 });
  try {
    const n = await rescoreBatch(id, parsed.data.weights, parsed.data.targetIndustries);
    return NextResponse.json({ rescored: n });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Rescore failed" }, { status: 400 });
  }
}
