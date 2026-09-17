import { randomUUID } from "node:crypto";
import pLimit from "p-limit";
import { autoMapColumns, parseCsv, type MappedField } from "./csv";
import { db, ensureSchema, getBatch, getLeads, rowToLead } from "./db";
import { enrichLead } from "./enrich";
import { findDuplicates, normalizeDomain, parseEmployees, parseMoney, websiteFromDomain } from "./normalize";
import { scoreLead } from "./scoring";
import type { Batch, BatchStats, Lead, ScoreWeights, Tier } from "./types";
import { DEFAULT_TARGET_INDUSTRIES, DEFAULT_WEIGHTS } from "./types";

const CONCURRENCY = Number(process.env.ENRICH_CONCURRENCY ?? 4);

function pick(row: Record<string, string>, map: Record<MappedField, string | null>, field: MappedField): string | null {
  const col = map[field];
  if (!col) return null;
  const v = row[col];
  return v && v.trim() ? v.trim() : null;
}

export async function createBatchFromCsv(text: string, name: string): Promise<{ batch: Batch; warnings: string[] }> {
  await ensureSchema();
  const parsed = parseCsv(text);
  if (!parsed.headers.length || !parsed.rows.length) throw new Error("CSV appears to be empty.");
  const map = autoMapColumns(parsed.headers);
  if (!map.company && !map.website) throw new Error(`Could not find a company or website column. Headers seen: ${parsed.headers.join(", ")}`);

  const warnings = [...parsed.errors];
  const now = new Date().toISOString();
  const batchId = randomUUID();

  const leads: Lead[] = parsed.rows.map((row) => {
    const website = pick(row, map, "website");
    const domain = normalizeDomain(website ?? pick(row, map, "email"));
    const company = pick(row, map, "company") ?? domain ?? "Unknown company";
    const locParts = [pick(row, map, "location"), pick(row, map, "city"), pick(row, map, "state"), pick(row, map, "country")].filter(Boolean);
    const owner = pick(row, map, "ownerName") ?? ([pick(row, map, "firstName"), pick(row, map, "lastName")].filter(Boolean).join(" ") || null);
    return {
      id: randomUUID(),
      batchId,
      company,
      website: website ?? websiteFromDomain(domain),
      domain,
      industry: pick(row, map, "industry"),
      location: locParts.length ? [...new Set(locParts)].join(", ") : null,
      employees: parseEmployees(pick(row, map, "employees")),
      revenue: parseMoney(pick(row, map, "revenue")),
      ownerName: owner,
      email: pick(row, map, "email")?.toLowerCase() ?? null,
      phone: pick(row, map, "phone"),
      linkedin: pick(row, map, "linkedin"),
      sourceRow: row,
      enrichment: null,
      validation: null,
      score: null,
      tier: null,
      scoreBreakdown: null,
      dedupeOf: null,
      status: "new",
      notes: null,
      opener: null,
      enrichedAt: null,
      createdAt: now,
    };
  });

  const dupes = findDuplicates(leads.map((l) => ({ id: l.id, company: l.company, domain: l.domain, location: l.location })));
  for (const l of leads) {
    l.dedupeOf = dupes.get(l.id) ?? null;
    // Preliminary score from CSV fields alone so the table is useful immediately.
    const s = scoreLead(l, DEFAULT_WEIGHTS, DEFAULT_TARGET_INDUSTRIES);
    l.score = s.score;
    l.tier = s.tier;
    l.scoreBreakdown = s;
  }

  const batch: Batch = {
    id: batchId,
    name,
    createdAt: now,
    total: leads.length,
    processed: 0,
    duplicates: dupes.size,
    status: "pending",
    weights: DEFAULT_WEIGHTS,
    targetIndustries: DEFAULT_TARGET_INDUSTRIES,
    columnMap: map,
  };

  const c = db();
  const statements = [
    {
      sql: `INSERT INTO batches (id, name, created_at, total, processed, duplicates, status, weights, target_industries, column_map)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [batch.id, batch.name, batch.createdAt, batch.total, 0, batch.duplicates, batch.status, JSON.stringify(batch.weights), JSON.stringify(batch.targetIndustries), JSON.stringify(map)],
    },
    ...leads.map((l) => ({
      sql: `INSERT INTO leads (id, batch_id, company, website, domain, industry, location, employees, revenue, owner_name, email, phone, linkedin, source_row, score, tier, score_breakdown, dedupe_of, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
      args: [l.id, l.batchId, l.company, l.website, l.domain, l.industry, l.location, l.employees, l.revenue, l.ownerName, l.email, l.phone, l.linkedin, JSON.stringify(l.sourceRow), l.score, l.tier, JSON.stringify(l.scoreBreakdown), l.dedupeOf, l.createdAt],
    })),
  ];
  await c.batch(statements, "write");
  return { batch, warnings };
}

export function computeStats(leads: Lead[]): BatchStats {
  const unique = leads.filter((l) => !l.dedupeOf);
  const tierCounts: Record<Tier, number> = { A: 0, B: 0, C: 0, D: 0 };
  let scoreSum = 0;
  let scored = 0;
  for (const l of unique) {
    if (l.tier) tierCounts[l.tier]++;
    if (l.score != null) {
      scoreSum += l.score;
      scored++;
    }
  }
  return {
    total: leads.length,
    unique: unique.length,
    duplicates: leads.length - unique.length,
    processed: unique.filter((l) => l.enrichedAt).length,
    tierCounts,
    contactable: unique.filter((l) => l.validation?.contactable).length,
    ownerIdentified: unique.filter((l) => l.ownerName || l.enrichment?.ownerHints.length).length,
    avgScore: scored ? Math.round(scoreSum / scored) : null,
    blocked: unique.filter((l) => l.enrichment?.blocked).length,
    unreachable: unique.filter((l) => l.enrichment && !l.enrichment.reachable && !l.enrichment.blocked && l.domain).length,
    peOwned: unique.filter((l) => l.scoreBreakdown?.flags.includes("likely-pe-or-corporate-owned")).length,
  };
}

async function persistLead(l: Lead): Promise<void> {
  await db().execute({
    sql: `UPDATE leads SET enrichment = ?, validation = ?, score = ?, tier = ?, score_breakdown = ?, enriched_at = ?,
          owner_name = COALESCE(owner_name, ?), email = COALESCE(email, ?), phone = COALESCE(phone, ?), linkedin = COALESCE(linkedin, ?)
          WHERE id = ?`,
    args: [
      JSON.stringify(l.enrichment),
      JSON.stringify(l.validation),
      l.score,
      l.tier,
      JSON.stringify(l.scoreBreakdown),
      l.enrichedAt,
      l.enrichment?.ownerHints[0] ?? null,
      l.validation?.bestEmail ?? null,
      l.validation?.bestPhone ?? null,
      l.enrichment?.socials?.linkedin ?? null,
      l.id,
    ],
  });
}

/**
 * Process the next chunk of un-enriched, non-duplicate leads. Chunked so it
 * fits inside a serverless invocation; the client keeps calling until done.
 */
export async function processChunk(batchId: string, size: number): Promise<{ processed: number; remaining: number; done: boolean }> {
  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch not found");
  const res = await db().execute({
    sql: `SELECT * FROM leads WHERE batch_id = ? AND enriched_at IS NULL AND dedupe_of IS NULL ORDER BY score DESC NULLS LAST LIMIT ?`,
    args: [batchId, size],
  });
  const leads = res.rows.map(rowToLead);
  const limit = pLimit(CONCURRENCY);
  await Promise.all(
    leads.map((lead) =>
      limit(async () => {
        try {
          const { enrichment, validation } = await enrichLead(lead);
          lead.enrichment = enrichment;
          lead.validation = validation;
        } catch (err) {
          lead.enrichment = {
            fetchedUrl: null, httpStatus: null, reachable: false, blocked: false, robotsDisallowed: false, title: null, description: null,
            emails: [], phones: [], socials: {}, foundedYear: null, copyrightStartYear: null, ownerHints: [], ownershipSignals: [], techSignals: [],
            hasCareersPage: false, hasBlog: false, usesHttps: false, pagesScanned: [], jsonLd: null, domainRegistered: null, domainAgeYears: null,
            error: err instanceof Error ? err.message : "Enrichment failed", cached: false, fetchedAt: new Date().toISOString(),
          };
          lead.validation = { emails: [], phones: [], bestEmail: null, bestPhone: null, contactable: false };
        }
        if (!lead.ownerName && lead.enrichment.ownerHints[0]) lead.ownerName = lead.enrichment.ownerHints[0];
        const s = scoreLead(lead, batch.weights, batch.targetIndustries);
        lead.score = s.score;
        lead.tier = s.tier;
        lead.scoreBreakdown = s;
        lead.enrichedAt = new Date().toISOString();
        await persistLead(lead);
      }),
    ),
  );

  const remainingRes = await db().execute({
    sql: `SELECT COUNT(*) AS n FROM leads WHERE batch_id = ? AND enriched_at IS NULL AND dedupe_of IS NULL`,
    args: [batchId],
  });
  const remaining = Number(remainingRes.rows[0]?.n ?? 0);
  const processedRes = await db().execute({
    sql: `SELECT COUNT(*) AS n FROM leads WHERE batch_id = ? AND enriched_at IS NOT NULL`,
    args: [batchId],
  });
  const processed = Number(processedRes.rows[0]?.n ?? 0);
  await db().execute({
    sql: `UPDATE batches SET processed = ?, status = ? WHERE id = ?`,
    args: [processed, remaining === 0 ? "done" : "processing", batchId],
  });
  return { processed: leads.length, remaining, done: remaining === 0 };
}

/**
 * Queue failed leads (unreachable / timed out / errored, but not blocked or
 * robots-disallowed) for another attempt. Returns how many were reset.
 */
export async function resetFailedLeads(batchId: string): Promise<number> {
  await ensureSchema();
  const res = await db().execute({
    sql: `UPDATE leads SET enriched_at = NULL
          WHERE batch_id = ? AND dedupe_of IS NULL AND enriched_at IS NOT NULL AND domain IS NOT NULL
            AND json_extract(enrichment, '$.reachable') = 0
            AND json_extract(enrichment, '$.blocked') = 0
            AND json_extract(enrichment, '$.robotsDisallowed') = 0`,
    args: [batchId],
  });
  if (res.rowsAffected > 0) {
    await db().execute({ sql: `UPDATE batches SET status = 'processing' WHERE id = ?`, args: [batchId] });
  }
  return res.rowsAffected;
}

export async function rescoreBatch(batchId: string, weights: ScoreWeights, targetIndustries: string[]): Promise<number> {
  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch not found");
  const leads = await getLeads(batchId);
  const statements = leads.map((l) => {
    const s = scoreLead(l, weights, targetIndustries);
    return { sql: `UPDATE leads SET score = ?, tier = ?, score_breakdown = ? WHERE id = ?`, args: [s.score, s.tier, JSON.stringify(s), l.id] };
  });
  statements.push({
    sql: `UPDATE batches SET weights = ?, target_industries = ? WHERE id = ?`,
    args: [JSON.stringify(weights), JSON.stringify(targetIndustries), batchId],
  });
  await db().batch(statements, "write");
  return leads.length;
}
