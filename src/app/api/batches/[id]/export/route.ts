import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import { getBatch, getLeads } from "@/lib/db";
import { formatMoney } from "@/lib/normalize";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";

function generic(l: Lead) {
  const e = l.enrichment;
  const v = l.validation;
  return {
    "Acquisition Fit Score": l.score ?? "",
    Tier: l.tier ?? "",
    Company: l.company,
    Website: l.website ?? "",
    Industry: l.industry ?? "",
    Location: l.location ?? "",
    "Est. Revenue": l.revenue ?? "",
    "Est. Revenue (fmt)": formatMoney(l.revenue),
    Employees: l.employees ?? "",
    Owner: l.ownerName ?? "",
    "Best Email": v?.bestEmail ?? l.email ?? "",
    "Email Verdict": v?.emails.find((x) => x.email === (v?.bestEmail ?? ""))?.verdict ?? "",
    "Best Phone": v?.bestPhone ?? l.phone ?? "",
    LinkedIn: l.linkedin ?? e?.socials?.linkedin ?? "",
    "Founded Year": e?.foundedYear ?? "",
    "Domain Age (yrs)": e?.domainAgeYears ?? "",
    "Tech Signals": e?.techSignals.join("; ") ?? "",
    "Ownership Signals": e?.ownershipSignals.join("; ") ?? "",
    Flags: l.scoreBreakdown?.flags.join("; ") ?? "",
    "Score Reasons": l.scoreBreakdown?.components.map((c) => `${c.label}: ${c.reason}`).join(" | ") ?? "",
    Status: l.status,
    Notes: l.notes ?? "",
    "Outreach Opener": l.opener ?? "",
  };
}

/** HubSpot "Import companies" friendly headers so the file maps with zero clicks. */
function hubspot(l: Lead) {
  const e = l.enrichment;
  const v = l.validation;
  return {
    Name: l.company,
    "Company Domain Name": l.domain ?? "",
    Industry: l.industry ?? "",
    City: l.location?.split(",")[0]?.trim() ?? "",
    "Annual Revenue": l.revenue ?? "",
    "Number of Employees": l.employees ?? "",
    Phone: v?.bestPhone ?? l.phone ?? "",
    "LinkedIn Company Page": l.linkedin ?? e?.socials?.linkedin ?? "",
    Description: e?.description ?? "",
    "Year Founded": e?.foundedYear ?? "",
    "Lead Status": l.status.toUpperCase(),
    "Acquisition Fit Score": l.score ?? "",
    "Acquisition Fit Tier": l.tier ?? "",
    "Owner Name": l.ownerName ?? "",
    "Owner Email": v?.bestEmail ?? l.email ?? "",
  };
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const batch = await getBatch(id);
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "hubspot" ? "hubspot" : "generic";
  const ids = url.searchParams.get("ids")?.split(",").filter(Boolean);
  const minScore = Number(url.searchParams.get("minScore") ?? 0);
  const tiers = url.searchParams.get("tiers")?.split(",").filter(Boolean);

  let leads = (await getLeads(id)).filter((l) => !l.dedupeOf);
  if (ids?.length) leads = leads.filter((l) => ids.includes(l.id));
  if (minScore) leads = leads.filter((l) => (l.score ?? 0) >= minScore);
  if (tiers?.length) leads = leads.filter((l) => l.tier && tiers.includes(l.tier));

  const rows = leads.map((l) => (format === "hubspot" ? hubspot(l) : generic(l)));
  const csv = toCsv(rows);
  const safe = batch.name.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${safe}_${format}_leadlens.csv"`,
    },
  });
}
