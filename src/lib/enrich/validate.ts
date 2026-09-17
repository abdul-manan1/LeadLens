import dns from "node:dns/promises";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import type { EmailValidation, PhoneValidation, Validation } from "../types";

const EMAIL_SYNTAX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org",
  "yopmail.com", "trashmail.com", "getnada.com", "dispostable.com", "sharklasers.com", "maildrop.cc",
]);

const ROLE_PREFIXES = new Set([
  "info", "contact", "sales", "support", "admin", "office", "hello", "team", "help", "service",
  "customerservice", "marketing", "billing", "jobs", "careers", "hr", "press", "media", "webmaster",
  "noreply", "no-reply", "mail", "enquiries", "inquiries", "general", "reception", "frontdesk",
]);

const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "live.com", "msn.com", "comcast.net", "att.net"]);

const mxMemo = new Map<string, Promise<boolean>>();

/**
 * DNS-over-HTTPS fallback (RFC 8484 JSON). Raw UDP/TCP DNS from Node's c-ares
 * resolver is blocked in many sandboxes and serverless runtimes; HTTPS is not.
 */
async function dohHasRecord(domain: string, type: "MX" | "A"): Promise<boolean | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = (await res.json()) as { Status?: number; Answer?: { type: number }[] };
    if (json.Status === 3) return false; // NXDOMAIN
    const want = type === "MX" ? 15 : 1;
    return Boolean(json.Answer?.some((a) => a.type === want));
  } catch {
    return null;
  }
}

export async function hasMailServer(domain: string): Promise<boolean> {
  const key = domain.toLowerCase();
  if (!mxMemo.has(key)) {
    mxMemo.set(
      key,
      (async () => {
        try {
          const mx = await dns.resolveMx(key);
          if (mx.length > 0) return true;
          return false; // authoritative empty answer: no mail server
        } catch {
          /* resolver unavailable or NXDOMAIN, try DoH */
        }
        const mx = await dohHasRecord(key, "MX");
        if (mx !== null) return mx;
        try {
          const a = await dns.resolve4(key);
          return a.length > 0;
        } catch {
          return (await dohHasRecord(key, "A")) ?? false;
        }
      })(),
    );
  }
  return mxMemo.get(key)!;
}

export async function validateEmail(email: string, companyDomain: string | null): Promise<EmailValidation> {
  const e = email.trim().toLowerCase();
  const syntaxValid = EMAIL_SYNTAX.test(e);
  const [local, domain] = e.split("@");
  const disposable = domain ? DISPOSABLE_DOMAINS.has(domain) : false;
  const roleBased = local ? ROLE_PREFIXES.has(local.replace(/[^a-z]/g, "")) : false;
  const mxFound = syntaxValid && domain ? await hasMailServer(domain) : false;
  const matchesCompanyDomain =
    companyDomain && domain ? (domain === companyDomain || domain.endsWith(`.${companyDomain}`) ? true : FREE_MAIL.has(domain) ? null : false) : null;

  let verdict: EmailValidation["verdict"] = "invalid";
  if (syntaxValid && mxFound && !disposable) verdict = roleBased || matchesCompanyDomain === false ? "risky" : "valid";
  else if (syntaxValid && !mxFound) verdict = "invalid";

  return { email: e, syntaxValid, mxFound, disposable, roleBased, matchesCompanyDomain, verdict };
}

export function guessCountry(location: string | null): CountryCode {
  const l = (location ?? "").toLowerCase();
  if (/\b(uk|united kingdom|england|scotland|wales|london)\b/.test(l)) return "GB";
  if (/\b(canada|ontario|quebec|british columbia|alberta|toronto|vancouver)\b/.test(l)) return "CA";
  if (/\b(australia|sydney|melbourne|nsw|queensland)\b/.test(l)) return "AU";
  if (/\b(ireland|dublin)\b/.test(l)) return "IE";
  if (/\b(germany|deutschland|berlin|munich)\b/.test(l)) return "DE";
  if (/\b(india|mumbai|bangalore|delhi)\b/.test(l)) return "IN";
  return "US";
}

export function validatePhone(raw: string, country: CountryCode): PhoneValidation {
  const parsed = parsePhoneNumberFromString(raw, country);
  if (!parsed) return { raw, e164: null, national: null, valid: false, country: null };
  return {
    raw,
    e164: parsed.number,
    national: parsed.formatNational(),
    valid: parsed.isValid(),
    country: parsed.country ?? null,
  };
}

export async function validateContacts(input: {
  emails: string[];
  phones: string[];
  companyDomain: string | null;
  location: string | null;
}): Promise<Validation> {
  const country = guessCountry(input.location);
  const emails = await Promise.all(
    [...new Set(input.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))].slice(0, 10).map((e) => validateEmail(e, input.companyDomain)),
  );
  const seen = new Set<string>();
  const phones: PhoneValidation[] = [];
  for (const p of input.phones) {
    const v = validatePhone(p, country);
    const key = v.e164 ?? v.raw;
    if (seen.has(key)) continue;
    seen.add(key);
    phones.push(v);
  }

  // Ranking: valid personal email on the company domain > valid role email > risky > none.
  const rank = (v: EmailValidation) =>
    (v.verdict === "valid" ? 100 : v.verdict === "risky" ? 50 : 0) + (v.matchesCompanyDomain ? 20 : 0) - (v.roleBased ? 10 : 0);
  const bestEmail = [...emails].filter((e) => e.verdict !== "invalid").sort((a, b) => rank(b) - rank(a))[0]?.email ?? null;
  const bestPhone = phones.find((p) => p.valid)?.e164 ?? null;
  // Text-scraped digit runs (license numbers, order IDs) parse as invalid phones; hide them once a real one exists.
  const validPhones = phones.filter((p) => p.valid);
  const shownPhones = validPhones.length ? validPhones : phones.slice(0, 3);

  return { emails, phones: shownPhones, bestEmail, bestPhone, contactable: Boolean(bestEmail || bestPhone) };
}
