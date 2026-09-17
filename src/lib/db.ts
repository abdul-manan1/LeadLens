import { createClient, type Client, type Row } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import type {
  Batch,
  Lead,
  ScoreWeights,
  WebsiteEnrichment,
} from "./types";
import { DEFAULT_TARGET_INDUSTRIES, DEFAULT_WEIGHTS } from "./types";

/**
 * Storage: libSQL (SQLite-compatible).
 *  - Local dev / Docker: a file database at ./data/leadlens.db (zero setup).
 *  - Serverless (Vercel): point DATABASE_URL at a Turso libSQL instance and set
 *    DATABASE_AUTH_TOKEN. The client code is identical for both.
 */
declare global {
  var __leadlensDb: Client | undefined;
  var __leadlensDbReady: Promise<void> | undefined;
}

function resolveUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  const dir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return `file:${path.join(dir, "leadlens.db").replace(/\\/g, "/")}`;
}

export function db(): Client {
  if (!globalThis.__leadlensDb) {
    globalThis.__leadlensDb = createClient({
      url: resolveUrl(),
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });
  }
  return globalThis.__leadlensDb;
}

export async function ensureSchema(): Promise<void> {
  if (!globalThis.__leadlensDbReady) {
    globalThis.__leadlensDbReady = (async () => {
      const c = db();
      await c.batch(
        [
          `CREATE TABLE IF NOT EXISTS batches (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            total INTEGER NOT NULL DEFAULT 0,
            processed INTEGER NOT NULL DEFAULT 0,
            duplicates INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending',
            weights TEXT NOT NULL,
            target_industries TEXT NOT NULL,
            column_map TEXT NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS leads (
            id TEXT PRIMARY KEY,
            batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
            company TEXT NOT NULL,
            website TEXT,
            domain TEXT,
            industry TEXT,
            location TEXT,
            employees INTEGER,
            revenue REAL,
            owner_name TEXT,
            email TEXT,
            phone TEXT,
            linkedin TEXT,
            source_row TEXT NOT NULL,
            enrichment TEXT,
            validation TEXT,
            score INTEGER,
            tier TEXT,
            score_breakdown TEXT,
            dedupe_of TEXT,
            status TEXT NOT NULL DEFAULT 'new',
            notes TEXT,
            opener TEXT,
            enriched_at TEXT,
            created_at TEXT NOT NULL
          )`,
          `CREATE INDEX IF NOT EXISTS idx_leads_batch ON leads(batch_id)`,
          `CREATE INDEX IF NOT EXISTS idx_leads_domain ON leads(domain)`,
          `CREATE TABLE IF NOT EXISTS enrichment_cache (
            domain TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            fetched_at TEXT NOT NULL
          )`,
        ],
        "write",
      );
    })();
  }
  return globalThis.__leadlensDbReady;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function rowToBatch(r: Row): Batch {
  return {
    id: String(r.id),
    name: String(r.name),
    createdAt: String(r.created_at),
    total: Number(r.total),
    processed: Number(r.processed),
    duplicates: Number(r.duplicates),
    status: r.status as Batch["status"],
    weights: parseJson<ScoreWeights>(r.weights, DEFAULT_WEIGHTS),
    targetIndustries: parseJson<string[]>(
      r.target_industries,
      DEFAULT_TARGET_INDUSTRIES,
    ),
    columnMap: parseJson<Record<string, string | null>>(r.column_map, {}),
  };
}

export function rowToLead(r: Row): Lead {
  return {
    id: String(r.id),
    batchId: String(r.batch_id),
    company: String(r.company),
    website: (r.website as string | null) ?? null,
    domain: (r.domain as string | null) ?? null,
    industry: (r.industry as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    employees: r.employees == null ? null : Number(r.employees),
    revenue: r.revenue == null ? null : Number(r.revenue),
    ownerName: (r.owner_name as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    linkedin: (r.linkedin as string | null) ?? null,
    sourceRow: parseJson<Record<string, string>>(r.source_row, {}),
    enrichment: parseJson<WebsiteEnrichment | null>(r.enrichment, null),
    validation: parseJson<Lead["validation"]>(r.validation, null),
    score: r.score == null ? null : Number(r.score),
    tier: (r.tier as Lead["tier"]) ?? null,
    scoreBreakdown: parseJson<Lead["scoreBreakdown"]>(r.score_breakdown, null),
    dedupeOf: (r.dedupe_of as string | null) ?? null,
    status: (r.status as Lead["status"]) ?? "new",
    notes: (r.notes as string | null) ?? null,
    opener: (r.opener as string | null) ?? null,
    enrichedAt: (r.enriched_at as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

export async function getBatch(id: string): Promise<Batch | null> {
  await ensureSchema();
  const res = await db().execute({
    sql: "SELECT * FROM batches WHERE id = ?",
    args: [id],
  });
  return res.rows[0] ? rowToBatch(res.rows[0]) : null;
}

export async function listBatches(): Promise<Batch[]> {
  await ensureSchema();
  const res = await db().execute(
    "SELECT * FROM batches ORDER BY created_at DESC LIMIT 50",
  );
  return res.rows.map(rowToBatch);
}

export async function getLeads(batchId: string): Promise<Lead[]> {
  await ensureSchema();
  const res = await db().execute({
    sql: "SELECT * FROM leads WHERE batch_id = ? ORDER BY score DESC NULLS LAST, company ASC",
    args: [batchId],
  });
  return res.rows.map(rowToLead);
}

export async function getLead(id: string): Promise<Lead | null> {
  await ensureSchema();
  const res = await db().execute({
    sql: "SELECT * FROM leads WHERE id = ?",
    args: [id],
  });
  return res.rows[0] ? rowToLead(res.rows[0]) : null;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function getCachedEnrichment(
  domain: string,
): Promise<WebsiteEnrichment | null> {
  await ensureSchema();
  const res = await db().execute({
    sql: "SELECT payload, fetched_at FROM enrichment_cache WHERE domain = ?",
    args: [domain],
  });
  const row = res.rows[0];
  if (!row) return null;
  const age = Date.now() - new Date(String(row.fetched_at)).getTime();
  if (age > CACHE_TTL_MS) return null;
  const payload = parseJson<WebsiteEnrichment | null>(row.payload, null);
  return payload ? { ...payload, cached: true } : null;
}

export async function setCachedEnrichment(
  domain: string,
  payload: WebsiteEnrichment,
): Promise<void> {
  await ensureSchema();
  await db().execute({
    sql: `INSERT INTO enrichment_cache (domain, payload, fetched_at) VALUES (?, ?, ?)
          ON CONFLICT(domain) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
    args: [domain, JSON.stringify(payload), new Date().toISOString()],
  });
}
