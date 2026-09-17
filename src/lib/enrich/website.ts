import * as cheerio from "cheerio";
import type { WebsiteEnrichment } from "../types";
import { getRobots, isAllowed, politeFetch } from "./fetcher";
import { looksLikeFirstName } from "./first-names";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const FOUNDED_RE =
  /\b(?:since|established|est\.?|founded|serving [a-z\s]+ since|in business since|family[- ]owned since)\s*(?:in\s*)?((?:18|19|20)\d{2})\b/gi;
const COPYRIGHT_RE = /(?:©|&copy;|copyright)\s*(?:\(c\)\s*)?((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}))?/i;

const OWNERSHIP_SIGNALS: [RegExp, string][] = [
  [/portfolio company/i, "Describes itself as a portfolio company"],
  [/\b(?:a|an)\s+(?:wholly[- ]owned\s+)?subsidiary of\b/i, "Subsidiary of a parent company"],
  [/\ba division of\b/i, "Division of a larger company"],
  [/\bpart of the [A-Z][\w&\s]{2,40} (?:family of companies|group)\b/, "Part of a family of companies"],
  [/\b(?:was|were|has been|recently)\s+acquired by\b/i, "Mentions being acquired"],
  [/\bbacked by\b.*\b(?:private equity|capital partners|investors)\b/i, "Mentions private-equity backing"],
  [/\bprivate equity\b/i, "Mentions private equity"],
  [/\bfranchise(?:e|ee|s)?\b/i, "Franchise language"],
  [/\bpublicly traded\b|\bNASDAQ:|\bNYSE:/i, "Publicly traded"],
];

const OWNER_TITLE_RE =
  /\b(owner|founder|co-founder|president|ceo|chief executive|principal|managing partner|proprietor)\b/i;
const NAME_RE = /\b([A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-zA-Z'-]+)\b/g;
const NOT_A_NAME =
  /^(Our|The|Contact|About|Meet|Family|Owned|Operated|Since|Call|Home|Learn|More|Read|View|Team|Staff|Company|Owner|Owners|Founder|Founders|President|Ceo|Chief|Executive|Officer|Principal|Managing|Partner|Proprietor|Director|Manager|Heating|Cooling|Plumbing|Services|Service|Inc|Llc|Group|Machine|Pest|Control|Air|Conditioning|Electric|Roofing|Landscaping|Cleaning|Dental|Law|Firm|Welcome|Today|Free|Estimate|Schedule|Request|Quote|Message|From|Letter|Word|Note|Get|Know|Story|History|Mission|Values|Careers|Join|Us|We|Are|And|Of|In|At|For|With|Your|You|Local|Trusted|Licensed|Insured|Certified|Award|Winning|Best|Top|Rated|Serving|Proudly|Years|Year|Experience|Vice|Parts|Sales|Operations|Office|General|Field|Project|Estimator|Technician|Installer|Coordinator|Specialist|Assistant|Supervisor|Foreman|Dispatcher|Comfort|Advisor|Consultant|Accounting|Accountin|Marketing|Finance|Controller|Administrator|Engineer|Engineering|Quality|Production|Plant|Shop|Warehouse|Customer|Client|Human|Resources|Bio|Profile|Photo|Image|Video|Phone|Email|Fax|Address|Hours|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|North|South|East|West|Central|Greater|County|City|State|Street|Avenue|Road|Drive|Suite|Ohio|Texas|Florida|Georgia|Michigan|Wisconsin|Cleveland|Columbus|Houston|Austin|Atlanta|Dallas|Toledo|Akron|Copyright|Rights|Reserved|Privacy|Policy|Terms|Sitemap)$/i;

const TECH_SIGNALS: [RegExp, string][] = [
  [/cdn\.shopify\.com|Shopify\.theme/i, "Shopify"],
  [/wp-content|wp-includes/i, "WordPress"],
  [/static\.wixstatic\.com|wix\.com/i, "Wix"],
  [/squarespace\.com|static1\.squarespace/i, "Squarespace"],
  [/godaddy\.com\/|secureserver\.net|img1\.wsimg\.com/i, "GoDaddy Website Builder"],
  [/js\.hs-scripts\.com|hubspot/i, "HubSpot"],
  [/salesforce|pardot\.com/i, "Salesforce / Pardot"],
  [/googletagmanager\.com|gtag\(|google-analytics\.com|ga\('create'/i, "Google Analytics / Tag Manager"],
  [/connect\.facebook\.net|fbq\(/i, "Meta Pixel"],
  [/intercom\.io|widget\.intercom/i, "Intercom"],
  [/calendly\.com/i, "Calendly"],
  [/zendesk|zdassets/i, "Zendesk"],
  [/servicetitan|housecallpro|jobber\.com/i, "Field-service software"],
  [/mailchimp|list-manage\.com/i, "Mailchimp"],
  [/klaviyo/i, "Klaviyo"],
  [/stripe\.com\/v3|js\.stripe\.com/i, "Stripe"],
  [/recaptcha|hcaptcha/i, "reCAPTCHA on forms"],
  [/react|__next|_next\/static/i, "Modern JS framework"],
  [/livechat|tawk\.to|drift\.com|tidio/i, "Live chat"],
];

const SOCIAL_HOSTS: [RegExp, string][] = [
  [/linkedin\.com\/(company|in)\//i, "linkedin"],
  [/facebook\.com\//i, "facebook"],
  [/instagram\.com\//i, "instagram"],
  [/(twitter|x)\.com\//i, "twitter"],
  [/youtube\.com\/|youtu\.be\//i, "youtube"],
  [/yelp\.com\/biz\//i, "yelp"],
  [/bbb\.org\//i, "bbb"],
];

const SECONDARY_PATHS = ["/about", "/about-us", "/our-story", "/team", "/our-team", "/contact", "/contact-us"];

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

const NAME_RE_INITIALS = /\b((?:[A-Z]\.){1,2}\s*[A-Z][a-z]+(?:\s+[A-Z][a-zA-Z'-]+)?)\b/g;

function extractFromHtml(html: string, baseUrl: string, companyName = "") {
  // Insert a space between adjacent tags so "<b>Gabel</b><span>Co-owner" does not collapse into "GabelCo-owner".
  const $ = cheerio.load(html.replace(/></g, "> <"));
  $("script:not([type='application/ld+json']), style, noscript, svg").remove();
  const text = $("body").text().replace(/\s+/g, " ");
  const rawHtml = html;
  const companyWords = new Set(
    companyName
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 2),
  );

  const emails = uniq(
    [...(rawHtml.match(EMAIL_RE) ?? [])]
      .map((e) => e.toLowerCase().replace(/^mailto:/, ""))
      .filter((e) => !/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(e))
      .filter((e) => !/(sentry|wixpress|example\.com|domain\.com|email\.com|yourdomain)/i.test(e)),
  );

  const phones = uniq(
    [
      ...$("a[href^='tel:']")
        .map((_, el) => ($(el).attr("href") ?? "").replace(/^tel:/, ""))
        .get(),
      ...(text.match(PHONE_RE) ?? []),
    ].map((p) => p.trim()),
  ).slice(0, 8);

  const socials: Record<string, string> = {};
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    for (const [re, key] of SOCIAL_HOSTS) {
      if (re.test(href) && !socials[key]) socials[key] = href;
    }
  });

  const foundedMatches = [...text.matchAll(FOUNDED_RE)].map((m) => Number(m[1]));
  const foundedYear = foundedMatches.length
    ? Math.min(...foundedMatches.filter((y) => y >= 1800 && y <= new Date().getFullYear()))
    : null;
  const copy = text.match(COPYRIGHT_RE);
  const copyrightStartYear = copy ? Number(copy[1]) : null;

  const ownershipSignals = OWNERSHIP_SIGNALS.filter(([re]) => re.test(text)).map(([, label]) => label);

  // Owner hints: capitalised two-word names within 60 chars of an owner title.
  const ownerHints: string[] = [];
  for (const m of text.matchAll(new RegExp(OWNER_TITLE_RE.source, "gi"))) {
    const start = Math.max(0, m.index! - 70);
    const window = text.slice(start, m.index! + 70);
    const candidates = [...window.matchAll(NAME_RE), ...window.matchAll(NAME_RE_INITIALS)].map((x) => x[1]);
    for (const candidate of candidates) {
      const tokens = candidate.split(/\s+/);
      if (tokens.length > 3) continue;
      if (tokens.some((t) => NOT_A_NAME.test(t))) continue;
      if (tokens.some((t) => t.length > 1 && t === t.toUpperCase() && !/^([A-Z]\.){1,2}$/.test(t))) continue; // "CEO", "HVAC"
      if (tokens.some((t) => companyWords.has(t.toLowerCase()))) continue; // "Broadview Roads"
      if (!looksLikeFirstName(tokens[0])) continue;
      const last = tokens[tokens.length - 1];
      if (last.length < 2 || NOT_A_NAME.test(last)) continue;
      ownerHints.push(candidate);
    }
  }

  const techSignals = TECH_SIGNALS.filter(([re]) => re.test(rawHtml)).map(([, label]) => label);
  const links = $("a[href]")
    .map((_, el) => ($(el).attr("href") ?? "").toLowerCase())
    .get();
  const hasCareersPage = links.some((h) => /career|jobs|join-our-team|employment|hiring/.test(h));
  const hasBlog = links.some((h) => /\/blog|\/news|\/articles|\/insights/.test(h));

  const ld: { value: NonNullable<WebsiteEnrichment["jsonLd"]> | null } = { value: null };
  $("script[type='application/ld+json']").each((_, el) => {
    if (ld.value) return;
    try {
      const parsed = JSON.parse($(el).text());
      const nodes = Array.isArray(parsed) ? parsed : parsed["@graph"] ?? [parsed];
      for (const node of nodes) {
        const type = String(node["@type"] ?? "");
        if (/Organization|LocalBusiness|Corporation|Store|Service|Dentist|Plumber|HVACBusiness|Electrician|RoofingContractor|HomeAndConstructionBusiness/i.test(type)) {
          const addr = node.address;
          const address =
            typeof addr === "string"
              ? addr
              : addr && typeof addr === "object"
                ? [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode].filter(Boolean).join(", ")
                : undefined;
          const founder = Array.isArray(node.founder)
            ? node.founder.map((f: { name?: string }) => f?.name).filter(Boolean).join(", ")
            : node.founder?.name ?? (typeof node.founder === "string" ? node.founder : undefined);
          ld.value = {
            type,
            name: node.name,
            telephone: node.telephone,
            email: node.email,
            founder: founder || undefined,
            foundingDate: node.foundingDate,
            address: address || undefined,
          };
          break;
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  });

  const title = ($("title").first().text() || $("meta[property='og:title']").attr("content") || "").trim() || null;
  const description =
    ($("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || "")
      .trim()
      .slice(0, 300) || null;

  void baseUrl;
  return {
    title,
    description,
    emails,
    phones,
    socials,
    foundedYear,
    copyrightStartYear,
    ownerHints: uniq(ownerHints).slice(0, 5),
    ownershipSignals: uniq(ownershipSignals),
    techSignals: uniq(techSignals),
    hasCareersPage,
    hasBlog,
    jsonLd: ld.value,
    text,
  };
}

export async function scrapeWebsite(domain: string, companyName = ""): Promise<Omit<WebsiteEnrichment, "domainRegistered" | "domainAgeYears" | "cached" | "fetchedAt">> {
  const base: Omit<WebsiteEnrichment, "domainRegistered" | "domainAgeYears" | "cached" | "fetchedAt"> = {
    fetchedUrl: null,
    httpStatus: null,
    reachable: false,
    blocked: false,
    robotsDisallowed: false,
    title: null,
    description: null,
    emails: [],
    phones: [],
    socials: {},
    foundedYear: null,
    copyrightStartYear: null,
    ownerHints: [],
    ownershipSignals: [],
    techSignals: [],
    hasCareersPage: false,
    hasBlog: false,
    usesHttps: false,
    pagesScanned: [],
    jsonLd: null,
    error: null,
  };

  // Try https first, then http; then www. variants.
  const candidates = [`https://${domain}`, `https://www.${domain}`, `http://${domain}`, `http://www.${domain}`];
  let home: Awaited<ReturnType<typeof politeFetch>> | null = null;
  let origin = "";
  for (const url of candidates) {
    const o = new URL(url).origin;
    const robots = await getRobots(o);
    if (!isAllowed(robots, "/")) {
      base.robotsDisallowed = true;
      base.error = "robots.txt disallows crawling";
      return base;
    }
    const res = await politeFetch(url);
    if (res.blocked) {
      base.blocked = true;
      base.httpStatus = res.status;
      base.fetchedUrl = url;
      base.error = `Blocked by anti-bot protection (HTTP ${res.status ?? "?"})`;
      return base;
    }
    if (res.ok && res.contentType?.includes("html")) {
      home = res;
      origin = new URL(res.finalUrl ?? url).origin;
      break;
    }
    if (res.status && res.status >= 400 && res.status < 500 && res.status !== 404) {
      base.httpStatus = res.status;
    }
    if (!base.error && res.error) base.error = res.error;
  }

  if (!home) {
    base.error = base.error ?? `Site unreachable (HTTP ${base.httpStatus ?? "no response"})`;
    return base;
  }

  base.reachable = true;
  base.error = null;
  base.httpStatus = home.status;
  base.fetchedUrl = home.finalUrl;
  base.usesHttps = (home.finalUrl ?? "").startsWith("https://");
  base.pagesScanned.push(home.finalUrl ?? candidates[0]);

  const merged = extractFromHtml(home.body, origin, companyName);

  // Secondary pages: only those the homepage actually links to, capped at 3, robots-checked.
  const $ = cheerio.load(home.body);
  const linked = new Set(
    $("a[href]")
      .map((_, el) => {
        try {
          return new URL($(el).attr("href") ?? "", origin).pathname.replace(/\/$/, "").toLowerCase();
        } catch {
          return "";
        }
      })
      .get(),
  );
  const robots = await getRobots(origin);
  const secondary = SECONDARY_PATHS.filter((p) => linked.has(p) && isAllowed(robots, p)).slice(0, 3);
  await Promise.all(
    secondary.map(async (p) => {
      const res = await politeFetch(`${origin}${p}`);
      if (!res.ok || !res.contentType?.includes("html")) return;
      base.pagesScanned.push(`${origin}${p}`);
      const extra = extractFromHtml(res.body, origin, companyName);
      merged.emails = uniq([...merged.emails, ...extra.emails]);
      merged.phones = uniq([...merged.phones, ...extra.phones]).slice(0, 8);
      merged.socials = { ...extra.socials, ...merged.socials };
      merged.foundedYear = merged.foundedYear ?? extra.foundedYear;
      merged.ownerHints = uniq([...merged.ownerHints, ...extra.ownerHints]).slice(0, 5);
      merged.ownershipSignals = uniq([...merged.ownershipSignals, ...extra.ownershipSignals]);
      merged.techSignals = uniq([...merged.techSignals, ...extra.techSignals]);
      merged.jsonLd = merged.jsonLd ?? extra.jsonLd;
      merged.hasCareersPage = merged.hasCareersPage || extra.hasCareersPage;
    }),
  );

  if (merged.jsonLd?.foundingDate && !merged.foundedYear) {
    const y = Number(String(merged.jsonLd.foundingDate).slice(0, 4));
    if (y > 1800) merged.foundedYear = y;
  }
  if (merged.jsonLd?.email) merged.emails = uniq([merged.jsonLd.email.toLowerCase(), ...merged.emails]);
  if (merged.jsonLd?.telephone) merged.phones = uniq([merged.jsonLd.telephone, ...merged.phones]);
  if (merged.jsonLd?.founder) merged.ownerHints = uniq([merged.jsonLd.founder, ...merged.ownerHints]);

  return {
    ...base,
    title: merged.title,
    description: merged.description,
    emails: merged.emails.slice(0, 10),
    phones: merged.phones,
    socials: merged.socials,
    foundedYear: merged.foundedYear,
    copyrightStartYear: merged.copyrightStartYear,
    ownerHints: merged.ownerHints,
    ownershipSignals: merged.ownershipSignals,
    techSignals: merged.techSignals,
    hasCareersPage: merged.hasCareersPage,
    hasBlog: merged.hasBlog,
    jsonLd: merged.jsonLd,
  };
}
