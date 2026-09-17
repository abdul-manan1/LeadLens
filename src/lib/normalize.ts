/** Normalization + deduplication helpers. */

const LEGAL_SUFFIXES =
  /\b(inc|inc\.|incorporated|llc|l\.l\.c\.|ltd|ltd\.|limited|corp|corp\.|corporation|co|co\.|company|plc|gmbh|pty|llp|lp|holdings|group|the)\b/g;

export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("@")) s = s.split("@")[1];
  if (!/^[a-z]+:\/\//.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    let host = u.hostname.replace(/^www\./, "");
    if (!host.includes(".")) return null;
    host = host.replace(/\.$/, "");
    return host;
  } catch {
    return null;
  }
}

export function websiteFromDomain(domain: string | null): string | null {
  return domain ? `https://${domain}` : null;
}

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse "$2.5M", "2,500,000", "1.2B", "500k" into a number of dollars. */
export function parseMoney(value: string | null | undefined): number | null {
  if (!value) return null;
  const s = value.toString().trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!s) return null;
  // ranges like "1m-5m" -> midpoint
  const range = s.match(/^([\d.]+)([kmb]?)-([\d.]+)([kmb]?)$/);
  if (range) {
    const a = parseMoney(range[1] + range[2]);
    const b = parseMoney(range[3] + range[4]);
    if (a != null && b != null) return (a + b) / 2;
  }
  const m = s.match(/^<?>?([\d.]+)\s*(k|m|mm|b|million|billion|thousand)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  const unit = m[2];
  if (!unit) return n;
  if (unit === "k" || unit === "thousand") return n * 1e3;
  if (unit === "m" || unit === "mm" || unit === "million") return n * 1e6;
  if (unit === "b" || unit === "billion") return n * 1e9;
  return n;
}

/** Parse "51-200", "25", "10+", "1,000" into an employee count. */
export function parseEmployees(value: string | null | undefined): number | null {
  if (!value) return null;
  const s = value.toString().toLowerCase().replace(/[,\s]/g, "");
  if (!s) return null;
  const range = s.match(/^(\d+)-(\d+)/);
  if (range) return Math.round((Number(range[1]) + Number(range[2])) / 2);
  const plus = s.match(/^(\d+)\+/);
  if (plus) return Number(plus[1]);
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

export function formatMoney(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

/** Simple bigram similarity (Dice coefficient) for fuzzy company-name matching. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let inter = 0;
  for (const [g, n] of ga) inter += Math.min(n, gb.get(g) ?? 0);
  return (2 * inter) / (a.length - 1 + (b.length - 1));
}

export interface DedupeInput {
  id: string;
  company: string;
  domain: string | null;
  location: string | null;
}

/**
 * Marks duplicates. Exact domain match always wins; otherwise a very close
 * normalized company name in the same location is treated as a duplicate.
 * Returns a map of duplicateId -> canonicalId.
 */
export function findDuplicates(rows: DedupeInput[]): Map<string, string> {
  const result = new Map<string, string>();
  const byDomain = new Map<string, string>();
  const canonical: { id: string; name: string; loc: string }[] = [];

  for (const row of rows) {
    if (row.domain) {
      const seen = byDomain.get(row.domain);
      if (seen) {
        result.set(row.id, seen);
        continue;
      }
    }
    const name = normalizeCompanyName(row.company);
    const loc = (row.location ?? "").toLowerCase().trim();
    let dupOf: string | null = null;
    for (const c of canonical) {
      if (c.name === name && (c.loc === loc || !loc || !c.loc)) {
        dupOf = c.id;
        break;
      }
      if (
        name.length > 6 &&
        c.loc === loc &&
        loc &&
        similarity(c.name, name) >= 0.92
      ) {
        dupOf = c.id;
        break;
      }
    }
    if (dupOf) {
      result.set(row.id, dupOf);
      continue;
    }
    canonical.push({ id: row.id, name, loc });
    if (row.domain) byDomain.set(row.domain, row.id);
  }
  return result;
}
