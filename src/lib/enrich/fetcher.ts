/**
 * Polite HTTP fetcher used by the enrichment pipeline.
 *  - identifies itself with a descriptive User-Agent
 *  - honours robots.txt (User-agent: * Disallow rules)
 *  - hard timeout + response size cap
 *  - detects CAPTCHA / WAF challenge pages and IP blocks instead of failing
 *  - optional outbound proxy via HTTPS_PROXY for IP-restricted targets
 */
import { ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";

export const USER_AGENT =
  process.env.SCRAPER_USER_AGENT ??
  "LeadLensBot/1.0 (+https://github.com/leadlens; acquisition-research; contact: set SCRAPER_CONTACT)";

const TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS ?? 8000);
const MAX_BYTES = Number(process.env.FETCH_MAX_BYTES ?? 1_500_000);

let dispatcher: Dispatcher | undefined;
function getDispatcher(): Dispatcher | undefined {
  const proxy = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  if (!proxy) return undefined;
  if (!dispatcher) dispatcher = new ProxyAgent(proxy);
  return dispatcher;
}

export interface FetchResult {
  ok: boolean;
  status: number | null;
  url: string;
  finalUrl: string | null;
  body: string;
  contentType: string | null;
  blocked: boolean;
  error: string | null;
  ms: number;
}

/** Patterns that only appear on interstitial challenge / denial pages, never on a normal site that merely embeds reCAPTCHA. */
const CHALLENGE_TITLE = /<title>[^<]*(just a moment|attention required|access denied|are you a human|verify you are human|security check|bot verification|blocked|forbidden|请稍候)[^<]*<\/title>/i;
const CHALLENGE_BODY = [
  /cf-chl-|cf_chl_|\/cdn-cgi\/challenge-platform\//i,
  /checking your browser before accessing/i,
  /enable javascript and cookies to continue/i,
  /perimeterx|_pxhd=|incapsula_resource|distil_r_captcha|datadome.*captcha|geo\.captcha-delivery\.com/i,
  /request unsuccessful\. incapsula incident id/i,
  /forbidden by administrative rules/i,
];

export function looksBlocked(status: number | null, body: string): boolean {
  const small = body.length < 20_000;
  if (status === 403 || status === 429 || status === 503 || status === 999) {
    // 999 = LinkedIn's rate-limit code; 503 with a short body is a Cloudflare / WAF interstitial.
    return small;
  }
  // A 200 can still be a challenge page (Cloudflare "Just a moment", DataDome, PerimeterX).
  // Require an interstitial-style title or a challenge script AND a small body so that
  // ordinary sites that embed reCAPTCHA on their contact form are not misclassified.
  if (!small) return false;
  const head = body.slice(0, 8000);
  return CHALLENGE_TITLE.test(head) || CHALLENGE_BODY.some((re) => re.test(head));
}

export async function politeFetch(url: string, init?: { accept?: string }): Promise<FetchResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await undiciFetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      dispatcher: getDispatcher(),
      headers: {
        "user-agent": USER_AGENT,
        accept: init?.accept ?? "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    const contentType = res.headers.get("content-type");
    let body = "";
    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: false });
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        body += decoder.decode(value, { stream: true });
        if (received > MAX_BYTES) {
          await reader.cancel().catch(() => undefined);
          break;
        }
      }
    }
    const blocked = looksBlocked(res.status, body);
    return {
      ok: res.ok && !blocked,
      status: res.status,
      url,
      finalUrl: res.url || url,
      body,
      contentType,
      blocked,
      error: null,
      ms: Date.now() - started,
    };
  } catch (err) {
    const message = err instanceof Error ? (err.name === "AbortError" ? "timeout" : err.message) : String(err);
    return {
      ok: false,
      status: null,
      url,
      finalUrl: null,
      body: "",
      contentType: null,
      blocked: false,
      error: message,
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Minimal robots.txt parser: returns the Disallow rules that apply to us (specific UA or *). */
export interface RobotsRules {
  disallow: string[];
  fetched: boolean;
}

const robotsMemo = new Map<string, RobotsRules>();

export async function getRobots(origin: string): Promise<RobotsRules> {
  const memo = robotsMemo.get(origin);
  if (memo) return memo;
  const res = await politeFetch(`${origin}/robots.txt`, { accept: "text/plain,*/*;q=0.8" });
  const rules: RobotsRules = { disallow: [], fetched: res.ok };
  if (res.ok && res.contentType?.includes("text")) {
    const groups: { agents: string[]; disallow: string[] }[] = [];
    let current: { agents: string[]; disallow: string[] } | null = null;
    for (const rawLine of res.body.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, "").trim();
      if (!line) continue;
      const [key, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      const k = key.trim().toLowerCase();
      if (k === "user-agent") {
        if (!current || current.disallow.length > 0) {
          current = { agents: [], disallow: [] };
          groups.push(current);
        }
        current.agents.push(value.toLowerCase());
      } else if (k === "disallow" && current) {
        if (value) current.disallow.push(value);
      }
    }
    const mine = groups.find((g) => g.agents.some((a) => a.includes("leadlens")));
    const star = groups.find((g) => g.agents.includes("*"));
    rules.disallow = (mine ?? star)?.disallow ?? [];
  }
  robotsMemo.set(origin, rules);
  return rules;
}

export function isAllowed(rules: RobotsRules, pathname: string): boolean {
  return !rules.disallow.some((rule) => {
    if (rule === "/") return true;
    const pattern = rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${pattern}`).test(pathname);
  });
}
