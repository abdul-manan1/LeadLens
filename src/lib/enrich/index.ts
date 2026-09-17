import { getCachedEnrichment, setCachedEnrichment } from "../db";
import type { Lead, Validation, WebsiteEnrichment } from "../types";
import { domainRegistrationDate, yearsSince } from "./rdap";
import { validateContacts } from "./validate";
import { scrapeWebsite } from "./website";

/**
 * Enrich one lead: live website scan (cached per domain for 7 days) + RDAP
 * domain age, then validate every email/phone we know about (from the source
 * CSV and from the site).
 */
export async function enrichLead(lead: Lead): Promise<{ enrichment: WebsiteEnrichment; validation: Validation }> {
  let enrichment: WebsiteEnrichment | null = null;

  if (lead.domain) {
    enrichment = await getCachedEnrichment(lead.domain);
    if (!enrichment) {
      const [site, registered] = await Promise.all([scrapeWebsite(lead.domain, lead.company), domainRegistrationDate(lead.domain)]);
      enrichment = {
        ...site,
        domainRegistered: registered,
        domainAgeYears: yearsSince(registered),
        cached: false,
        fetchedAt: new Date().toISOString(),
      };
      // Don't cache transient failures (timeouts) so a retry gets a fresh attempt.
      if (enrichment.reachable || enrichment.blocked || enrichment.robotsDisallowed || enrichment.httpStatus === 404) {
        await setCachedEnrichment(lead.domain, enrichment);
      }
    }
  } else {
    enrichment = {
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
      domainRegistered: null,
      domainAgeYears: null,
      error: "No website provided",
      cached: false,
      fetchedAt: new Date().toISOString(),
    };
  }

  const validation = await validateContacts({
    emails: [lead.email, ...enrichment.emails].filter((e): e is string => Boolean(e)),
    phones: [lead.phone, ...enrichment.phones].filter((p): p is string => Boolean(p)),
    companyDomain: lead.domain,
    location: lead.location,
  });

  return { enrichment, validation };
}
