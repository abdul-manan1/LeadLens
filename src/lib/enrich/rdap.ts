import { politeFetch } from "./fetcher";

/**
 * Domain registration date via RDAP (the IETF successor to WHOIS). rdap.org is
 * a free bootstrap redirector, no key required. Unsupported TLDs return null.
 * Business age is a strong proxy for an established, owner-operated SMB.
 */
const memo = new Map<string, Promise<string | null>>();

export function domainRegistrationDate(domain: string): Promise<string | null> {
  const key = domain.toLowerCase();
  if (!memo.has(key)) {
    memo.set(
      key,
      (async () => {
        try {
          const res = await politeFetch(`https://rdap.org/domain/${encodeURIComponent(key)}`, {
            accept: "application/rdap+json, application/json",
          });
          if (!res.ok || !res.body) return null;
          const json = JSON.parse(res.body) as { events?: { eventAction?: string; eventDate?: string }[] };
          const reg = json.events?.find((e) => e.eventAction === "registration");
          return reg?.eventDate ?? null;
        } catch {
          return null;
        }
      })(),
    );
  }
  return memo.get(key)!;
}

export function yearsSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round(((Date.now() - t) / (365.25 * 24 * 3600 * 1000)) * 10) / 10);
}
