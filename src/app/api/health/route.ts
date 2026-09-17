import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  await ensureSchema();
  return NextResponse.json({
    ok: true,
    storage: process.env.DATABASE_URL ? "libsql-remote" : "sqlite-file",
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    proxy: Boolean(process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY),
    time: new Date().toISOString(),
  });
}
