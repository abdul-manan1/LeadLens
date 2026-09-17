import type { Lead, ScoreComponent, ScoreResult, ScoreWeights, Tier } from "./types";

/**
 * Acquisition-Fit Score (0-100).
 *
 * Built for the searcher / acquisition-entrepreneur persona SaaSquatch serves:
 * the ideal target is an established, owner-operated SMB in a fragmented
 * industry, with $1M-$10M revenue, 10-100 staff, a reachable owner, and
 * under-invested digital operations (i.e. room for post-acquisition value
 * creation). Every component returns a human-readable reason so the score is
 * explainable, and weights are user-tunable per batch.
 */
export function tierFor(score: number): Tier {
  if (score >= 75) return "A";
  if (score >= 55) return "B";
  if (score >= 35) return "C";
  return "D";
}

function revenueRatio(rev: number | null): [number, string] {
  if (rev == null) return [0.3, "Revenue unknown, partial credit"];
  if (rev >= 1e6 && rev <= 10e6) return [1, `Revenue in the $1M-$10M sweet spot`];
  if (rev > 10e6 && rev <= 30e6) return [0.7, `Revenue $10M-$30M, upper end for a self-funded search`];
  if (rev >= 5e5 && rev < 1e6) return [0.5, `Revenue $500K-$1M, may be too small`];
  if (rev > 30e6 && rev <= 100e6) return [0.35, `Revenue $30M-$100M, likely institutional competition`];
  if (rev > 100e6) return [0.1, `Revenue over $100M, outside ETA range`];
  return [0.15, `Revenue under $500K, lifestyle business`];
}

function employeeRatio(n: number | null): [number, string] {
  if (n == null) return [0.3, "Headcount unknown, partial credit"];
  if (n >= 10 && n <= 100) return [1, `${n} employees, ideal operating size`];
  if ((n >= 5 && n < 10) || (n > 100 && n <= 250)) return [0.6, `${n} employees, workable`];
  if (n < 5) return [0.2, `${n} employees, owner-dependent micro business`];
  return [0.25, `${n} employees, larger than a typical search target`];
}

function maturityRatio(lead: Lead): [number, string] {
  const e = lead.enrichment;
  const now = new Date().getFullYear();
  const founded = e?.foundedYear ?? (e?.jsonLd?.foundingDate ? Number(String(e.jsonLd.foundingDate).slice(0, 4)) : null);
  if (founded && founded > 1800) {
    const age = now - founded;
    if (age >= 15) return [1, `Founded ${founded} (${age} yrs), proven durability`];
    if (age >= 8) return [0.75, `Founded ${founded} (${age} yrs), established`];
    if (age >= 3) return [0.45, `Founded ${founded} (${age} yrs), still young`];
    return [0.2, `Founded ${founded}, too new`];
  }
  const copyright = e?.copyrightStartYear;
  if (copyright && copyright < now - 2) {
    const age = now - copyright;
    if (age >= 12) return [0.8, `Website copyright since ${copyright}, long-standing`];
    if (age >= 6) return [0.6, `Website copyright since ${copyright}`];
  }
  const domainAge = e?.domainAgeYears;
  if (domainAge != null) {
    if (domainAge >= 15) return [0.85, `Domain registered ${domainAge} yrs ago`];
    if (domainAge >= 8) return [0.65, `Domain registered ${domainAge} yrs ago`];
    if (domainAge >= 3) return [0.4, `Domain registered ${domainAge} yrs ago`];
    return [0.15, `Domain only ${domainAge} yrs old`];
  }
  return [0.3, "No age signal found"];
}

function ownerRatio(lead: Lead): [number, string] {
  if (lead.ownerName) return [1, `Owner on file: ${lead.ownerName}`];
  const hints = lead.enrichment?.ownerHints ?? [];
  if (hints.length) return [0.7, `Likely owner from website: ${hints[0]}`];
  if (lead.enrichment?.socials?.linkedin) return [0.35, "Company LinkedIn found, owner discoverable"];
  return [0, "No owner identified"];
}

function contactRatio(lead: Lead): [number, string] {
  const v = lead.validation;
  if (!v) return [0, "Not yet verified"];
  const emailValid = v.emails.find((e) => e.verdict === "valid");
  const emailRisky = v.emails.find((e) => e.verdict === "risky");
  const phoneValid = v.phones.some((p) => p.valid);
  let r = 0;
  const parts: string[] = [];
  if (emailValid) {
    r += 0.6;
    parts.push("verified email");
  } else if (emailRisky) {
    r += 0.35;
    parts.push(emailRisky.roleBased ? "role-based email only" : "unverified email");
  }
  if (phoneValid) {
    r += 0.4;
    parts.push("valid phone");
  }
  return [Math.min(1, r), parts.length ? parts.join(" + ") : "No working email or phone"];
}

function upsideRatio(lead: Lead): [number, string] {
  const e = lead.enrichment;
  if (!e || !e.reachable) return [0.4, "Site unavailable, upside unknown"];
  const tech = e.techSignals;
  const sophisticated = tech.filter((t) => /HubSpot|Salesforce|Intercom|Modern JS|Klaviyo|Field-service|Live chat|Zendesk/.test(t)).length;
  const basic = tech.filter((t) => /WordPress|Wix|Squarespace|GoDaddy/.test(t)).length;
  const hasAnalytics = tech.some((t) => /Analytics/.test(t));
  if (sophisticated >= 2) return [0.35, "Digitally mature stack, less operational upside"];
  if (sophisticated === 1) return [0.6, "Some modern tooling, moderate upside"];
  if (basic && !hasAnalytics) return [1, "Basic web presence, no analytics, strong AI/ops upside"];
  if (!hasAnalytics) return [0.9, "No analytics or CRM detected, strong modernization upside"];
  return [0.75, "Lean stack with analytics only"];
}

function industryRatio(lead: Lead, targets: string[]): [number, string] {
  const text = `${lead.industry ?? ""} ${lead.enrichment?.title ?? ""} ${lead.enrichment?.description ?? ""}`.toLowerCase();
  if (!text.trim()) return [0.5, "Industry unknown"];
  const hit = targets.find((t) => text.includes(t.toLowerCase()));
  if (hit) return [1, `Matches target industry "${hit}"`];
  if (/software|saas|app|startup|crypto|venture|biotech|pharma/.test(text)) return [0.2, "Tech/venture profile, atypical for ETA"];
  return [0.5, "Industry not on target list"];
}

export function scoreLead(lead: Lead, weights: ScoreWeights, targetIndustries: string[]): ScoreResult {
  const specs: { key: keyof ScoreWeights; label: string; calc: () => [number, string] }[] = [
    { key: "revenue", label: "Revenue fit", calc: () => revenueRatio(lead.revenue) },
    { key: "employees", label: "Headcount fit", calc: () => employeeRatio(lead.employees) },
    { key: "maturity", label: "Business maturity", calc: () => maturityRatio(lead) },
    { key: "owner", label: "Owner identified", calc: () => ownerRatio(lead) },
    { key: "contactability", label: "Contactability", calc: () => contactRatio(lead) },
    { key: "upside", label: "Value-creation upside", calc: () => upsideRatio(lead) },
    { key: "industry", label: "Industry fit", calc: () => industryRatio(lead, targetIndustries) },
  ];

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const components: ScoreComponent[] = specs.map((s) => {
    const [ratio, reason] = s.calc();
    const weight = (weights[s.key] / totalWeight) * 100;
    return { key: s.key, label: s.label, weight: Math.round(weight * 10) / 10, ratio, points: Math.round(weight * ratio * 10) / 10, reason };
  });

  const penalties: { label: string; points: number }[] = [];
  const flags: string[] = [];
  const e = lead.enrichment;
  if (e?.ownershipSignals.length) {
    const pe = e.ownershipSignals.some((s) => /private|portfolio|acquired|subsidiary|publicly/i.test(s));
    penalties.push({ label: `Ownership signal: ${e.ownershipSignals[0]}`, points: pe ? -20 : -8 });
    flags.push(pe ? "likely-pe-or-corporate-owned" : "ownership-check");
  }
  if (e && !e.reachable && !e.blocked && lead.domain) {
    penalties.push({ label: "Website unreachable", points: -10 });
    flags.push("unreachable");
  }
  if (e?.blocked) flags.push("blocked-needs-manual-check");
  if (e?.robotsDisallowed) flags.push("robots-disallowed");
  if (!lead.domain) {
    penalties.push({ label: "No website on file", points: -5 });
    flags.push("no-website");
  }
  if (e?.hasCareersPage) flags.push("hiring");
  if (lead.validation?.emails.some((x) => x.verdict === "valid" && !x.roleBased)) flags.push("direct-email");

  const raw = components.reduce((a, c) => a + c.points, 0) + penalties.reduce((a, p) => a + p.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, tier: tierFor(score), components, penalties, flags };
}
