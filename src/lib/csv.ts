import Papa from "papaparse";

/**
 * Column auto-mapping. SaaSquatch exports (and most lead tools) use slightly
 * different headers; we match by normalized header aliases so users never
 * have to hand-map columns.
 */
export const FIELD_ALIASES: Record<string, string[]> = {
  company: [
    "company",
    "company name",
    "companyname",
    "business",
    "business name",
    "name",
    "organization",
    "org",
    "account",
    "account name",
  ],
  website: ["website", "web site", "url", "domain", "site", "company website", "homepage"],
  industry: ["industry", "category", "sector", "vertical", "naics", "sic", "business type", "keywords"],
  location: ["location", "address", "hq", "headquarters", "city/state", "region"],
  city: ["city", "town"],
  state: ["state", "province", "state/region"],
  country: ["country"],
  employees: [
    "employees",
    "employee count",
    "employee_count",
    "employeecount",
    "headcount",
    "company size",
    "size",
    "number of employees",
    "# employees",
    "est. employees",
    "estimated employees",
  ],
  revenue: [
    "revenue",
    "annual revenue",
    "estimated revenue",
    "est. revenue",
    "revenue estimate",
    "est revenue",
    "sales",
    "annual sales",
    "revenue (usd)",
  ],
  ownerName: [
    "owner",
    "owner name",
    "owner_name",
    "founder",
    "ceo",
    "president",
    "contact",
    "contact name",
    "decision maker",
    "principal",
    "full name",
  ],
  firstName: ["first name", "first_name", "firstname", "owner first name"],
  lastName: ["last name", "last_name", "lastname", "owner last name"],
  email: ["email", "e-mail", "email address", "owner email", "contact email", "work email"],
  phone: ["phone", "phone number", "telephone", "tel", "company phone", "mobile", "owner phone"],
  linkedin: ["linkedin", "linkedin url", "linkedin profile", "owner linkedin", "company linkedin"],
};

export type MappedField = keyof typeof FIELD_ALIASES;

function norm(h: string): string {
  return h.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
}

export function autoMapColumns(headers: string[]): Record<MappedField, string | null> {
  const map = {} as Record<MappedField, string | null>;
  const used = new Set<string>();
  const normalized = headers.map((h) => ({ raw: h, n: norm(h) }));

  for (const field of Object.keys(FIELD_ALIASES) as MappedField[]) {
    map[field] = null;
    const aliases = FIELD_ALIASES[field];
    // exact alias match first
    for (const alias of aliases) {
      const hit = normalized.find((h) => h.n === alias && !used.has(h.raw));
      if (hit) {
        map[field] = hit.raw;
        used.add(hit.raw);
        break;
      }
    }
    if (map[field]) continue;
    // then "contains" match (e.g. "Company Website URL")
    for (const alias of aliases) {
      if (alias.length < 4) continue;
      const hit = normalized.find(
        (h) => h.n.includes(alias) && !used.has(h.raw),
      );
      if (hit) {
        map[field] = hit.raw;
        used.add(hit.raw);
        break;
      }
    }
  }
  return map;
}

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
}

export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^﻿/, "");
  const result = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });
  const headers = result.meta.fields ?? [];
  return {
    headers,
    rows: result.data.filter((r) => Object.values(r).some((v) => v)),
    errors: result.errors.slice(0, 5).map((e) => `${e.type}: ${e.message}`),
  };
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  return Papa.unparse(rows, { columns, newline: "\r\n" });
}
