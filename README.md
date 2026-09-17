# LeadLens

**Acquisition-fit scoring, enrichment and verification for SaaSquatch Leads exports.**

Caprae Capital AI-Readiness Pre-Screening Challenge, Full Stack Developer track. Quality-first approach: one deep feature that plugs into the existing SaaSquatch workflow instead of re-scraping what SaaSquatch already scrapes well.

> Import a SaaSquatch export (or any lead CSV) → duplicates collapse → every company is scanned from live public web data and its contacts verified → each lead gets an explainable 0-100 **Acquisition-Fit Score** with A/B/C/D tiers → filter, tune the weights, and export a CSV or a HubSpot-ready CSV.

---

## Why this feature

SaaSquatch Leads is built for acquisition entrepreneurs and searchers (its homepage: "Powering 30+ Entrepreneurs and Searchers generating thousands of leads weekly"). It scrapes companies by industry and location, then charges **one credit per enriched lead**. Its own marketing tells users to use revenue estimates to "get better insights on which leads to enrich early" so they "never waste a single credit". The bottleneck for a searcher is therefore not *finding* 500 companies. It is deciding which 30 deserve a credit, a cold call, and an owner conversation.

In Caprae's careers webinar, Kevin Hong names **deal acquisition cost** as the one number he obsesses over: roughly **$125K per closed deal against an industry average near $2.5M**. He also gives the operating ratio behind it — about **13,000 cold calls a week producing roughly 110 positive seller conversations**, a hit rate under 1%. Every point of that ratio is decided *before* anyone dials, by which companies made the list. That is the lever LeadLens pulls: spend the credits and the calls on the leads most likely to be both a fit and reachable, and discard the ones that were never buyable.

LeadLens answers that question with the searcher persona, not a generic SDR persona, in mind:

| Rubric criterion | How LeadLens addresses it |
|---|---|
| **Business use case** | Score built around the ETA thesis: $1M-$10M revenue, 10-100 staff, established and owner-operated, in a fragmented industry, with under-invested digital operations (post-acquisition value creation is Caprae's stated edge). Penalizes companies that describe themselves as portfolio companies, subsidiaries, franchises or publicly traded. Removes duplicates so credits are never spent twice. Slots between SaaSquatch's export and the CRM. |
| **UX/UI** | Three-step guided flow (Import → Enrich & verify → Prioritize & export). Zero-config column mapping. Live progress with pause/resume. Filters for tier, min score, contactable, owner known, hide PE/corporate, status. Click any row for "Why this score" with per-factor bars and plain-English reasons. Status and notes per lead. |
| **Technicality** | Multi-page website extraction with cheerio, JSON-LD parsing, RDAP domain age, MX validation with a DNS-over-HTTPS fallback, libphonenumber parsing, fuzzy + domain dedupe. Robots.txt compliance, timeouts, size caps, concurrency limits, per-domain 7-day cache, proxy support, and explicit CAPTCHA/WAF detection that flags a lead for manual review instead of failing. Chunked processing that fits serverless limits. |
| **Design** | Single calm palette (teal brand, tier colors green/blue/amber/grey), Geist type, card layout, sticky header, consistent chips for signals, colour-coded score pills. |
| **Other** | HubSpot-import-ready CSV, tunable weights and target-industry list, optional Claude-generated outreach opener with a deterministic template fallback, ethical collection (public pages only, robots.txt honoured, descriptive User-Agent, no login-walled sources), documented API for automation. |

---

## Quick start

Requirements: Node.js 20+ (built and tested on Node 24). No database server, no API keys.

```bash
npm install
npm run dev
```

Open http://localhost:3000, click **"Real SMB sample (24 live sites)"**, and watch the enrichment run. The first pass scans 24 real company websites and takes roughly 60-90 seconds; every later run hits the 7-day cache and is near-instant.

Optional environment (copy `.env.example` to `.env.local`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | Point at a Turso/libSQL database for serverless hosting. Unset = local SQLite file at `data/leadlens.db`. |
| `ANTHROPIC_API_KEY` | Enables Claude-personalized outreach openers. Unset = template openers from the same facts. |
| `HTTPS_PROXY` | Route website scans through a proxy for IP-restricted targets. |
| `SCRAPER_USER_AGENT`, `FETCH_TIMEOUT_MS`, `FETCH_MAX_BYTES`, `ENRICH_CONCURRENCY` | Scraper tuning. |

Production build: `npm run build && npm start`. Container: `docker build -t leadlens . && docker run -p 3000:3000 -v leadlens-data:/app/data leadlens`.

---

## Sample datasets (`public/samples/`)

| File | What it is | Use it to see |
|---|---|---|
| `sample_leads.csv` | 26 rows, 24 real owner-operated SMBs (HVAC, plumbing, precision machining, pest control) plus one software company for contrast and two planted duplicates. Only public name/website/industry/location; no fabricated financials. | Live enrichment: founded years, owner hints, verified emails/phones, tech signals, blocked-site handling. |
| `saasquatch_style_export.csv` | 40 synthetic rows shaped like a SaaSquatch export (Employee Count, Estimated Revenue, Revenue Confidence, BBB Rating, Owner Name...) with messy values (`$2.5M`, `1M-5M`, `51-200`, `25+`, blanks, casing) and 3 planted duplicates. Companies are fictional; domains end in `.example.com` and are intentionally unreachable. | Column auto-mapping, value normalization, dedupe, and the scoring math with full firmographics. Regenerate with `node scripts/generate-synthetic-sample.mjs`. |

Any SaaSquatch export works: the mapper recognizes common header variants (company/business name, website/url/domain, employees/headcount/company size, revenue/annual revenue/est. revenue, owner/founder/CEO/contact, first + last name, email, phone, LinkedIn, city/state/country).

---

## What the pipeline does to each lead

1. **Normalize.** Website → canonical domain (strips scheme, `www.`, paths, casing). Revenue strings and employee ranges → numbers (midpoint for ranges). City/state/country → one location string. First + last name → owner.
2. **Deduplicate.** Exact domain match first, then normalized company name (legal suffixes stripped) within the same location with a bigram-similarity threshold of 0.92. Duplicates stay visible (toggle) but are never enriched or exported.
3. **Preliminary score.** From CSV fields alone, so the table is useful before the first HTTP request.
4. **Website scan** (cached per domain for 7 days). Tries `https`, `https://www`, `http`, `http://www`. Checks `robots.txt` before every request. Reads the homepage plus up to three of `/about`, `/about-us`, `/our-story`, `/team`, `/our-team`, `/contact`, `/contact-us` **only if the homepage links to them**. Extracts: title, meta description, emails (mailto + text), phones (tel: + text), social links (LinkedIn, Facebook, Instagram, X, YouTube, Yelp, BBB), founded year ("since 1960", "established in", "family owned since"), copyright start year, owner hints (names adjacent to owner/founder/president/CEO, gated by a first-name dictionary and company-word exclusion), ownership signals ("portfolio company", "subsidiary of", "acquired by", "franchise", "NASDAQ:"), tech signals (WordPress, Wix, Squarespace, GoDaddy, Shopify, HubSpot, Salesforce, GA/GTM, Meta Pixel, Intercom, Calendly, field-service software, live chat...), careers page, blog, HTTPS, and schema.org `LocalBusiness`/`Organization` JSON-LD (telephone, email, founder, foundingDate, address).
5. **Domain age** via RDAP (`rdap.org`), the IETF successor to WHOIS. Free, keyless.
6. **Verify contacts.** Emails: syntax, MX record (Node resolver, falling back to Cloudflare DNS-over-HTTPS because raw DNS is blocked in many sandboxes and serverless runtimes), disposable-domain list, role-based prefix detection (`info@`, `sales@`...), company-domain match. Verdict: valid / risky / invalid, and a ranked "best email". Phones: parsed with libphonenumber using a country guessed from the location, validated, normalized to E.164.
7. **Score** (below) and persist. Newly discovered owner, best email, best phone and LinkedIn are written back onto the lead without overwriting values that came from the CSV.

### Resilience choices

| Situation | Behaviour |
|---|---|
| Site returns 403/429/503, or a 200 that is a Cloudflare / DataDome / PerimeterX interstitial | Lead flagged **blocked-needs-manual-check**, no penalty applied for unreachability, result cached so we don't hammer it. |
| `robots.txt` disallows | Skipped and flagged **robots-disallowed**. |
| Timeout / DNS failure | Marked unreachable (-10), **not cached**, and a "Retry N failed" button re-queues them. |
| Serverless time limit | Enrichment runs in chunks of 4 leads per request (`maxDuration = 60`); the browser drives the loop and can pause/resume. |
| Changing HTML structures | Extraction is regex/heuristic over visible text and structured data rather than site-specific selectors; JSON-LD is preferred when present. |
| IP restrictions | `HTTPS_PROXY` routes all scans through any HTTP(S) proxy (residential/rotating providers work unchanged). |

---

## The Acquisition-Fit Score

Seven weighted factors, normalized to 100, each with a written reason. Defaults reflect the searcher persona; sliders in the UI re-score the whole batch in one click.

| Factor | Default weight | Full credit when |
|---|---|---|
| Revenue fit | 25 | $1M-$10M (0.7 for $10-30M, 0.5 for $0.5-1M, 0.3 when unknown) |
| Headcount fit | 15 | 10-100 employees |
| Business maturity | 15 | Founded 15+ years ago (falls back to copyright year, then domain age) |
| Owner identified | 15 | Named owner in the CSV (0.7 for a website hint, 0.35 for a company LinkedIn) |
| Contactability | 15 | MX-verified non-role email (0.6) + valid phone (0.4) |
| Value-creation upside | 10 | Basic site builder, no analytics/CRM: room for the AI and ops work Caprae does post-acquisition |
| Industry fit | 5 | Matches the editable target list (HVAC, plumbing, machining, distribution, dental, IT services...); tech/venture profiles get 0.2 |

Penalties: PE/corporate/franchise/public ownership language **-20**, website unreachable **-10**, no website **-5**. Tiers: **A ≥ 75, B ≥ 55, C ≥ 35, D < 35**.

On the real-SMB sample (no revenue or headcount in the input) scores top out in the 60s-70s; with SaaSquatch's revenue and employee estimates present, well-fitting leads reach tier A. Turning the owner weight up to 40 in the UI pushes the leads with verified owners into the 90s, which is the intended "tune for what you care about today" behaviour.

---

## UX design choices

The user is a searcher or an SDR who lives in spreadsheets and has no patience for configuration. Every decision below was made to remove a step, not to add a feature.

**One linear path, always visible.** A three-step stepper (Import → Enrich & verify → Prioritize & export) sits on both pages and marks the current stage. Users never have to guess what happens next or where they are in a multi-minute process.

**Zero-configuration import.** Most lead tools open with a column-mapping screen. LeadLens matches headers against an alias table (exact match, then substring) so a SaaSquatch export, an Apollo export and a hand-made sheet all just work. Drag-and-drop, click-to-browse and two one-click sample datasets all lead to the same place. The only optional input is a batch name.

**Progressive results instead of a spinner.** Leads are scored from the CSV fields the moment they land, so the table is sortable before a single HTTP request goes out. Enrichment then runs in chunks of four and the table, stat tiles and progress bar update after every chunk. The work is pausable and resumable, because a 500-row batch is a coffee break, not a click.

**The score explains itself.** A number nobody trusts is a number nobody uses. Clicking any row opens a drawer whose first section is "Why this score": one bar per factor, points earned out of points available, and a written reason such as "Founded 1957 (69 yrs), proven durability". Penalties are listed separately in red. Nothing is a black box.

**Judgment stays with the user.** The seven weights are sliders and the target-industry list is a text box; re-scoring the whole batch is one click. The tool has an opinion about what a good acquisition target looks like, but it never hides that opinion or forces it.

**Signals over raw data.** The table shows colour-coded score pills, mail and phone icons that are green, amber or grey by verification status, and short chips for the few things that change a decision: PE/corporate ownership, blocked site, hiring, tech stack. Full detail is one click away in the drawer, so the table stays scannable at 40 rows.

**Failures are information, not errors.** A site that blocks bots gets an amber "blocked" chip and a note to check it manually, not a red error or a silent drop. Unreachable sites get a "Retry N failed" button. The user always knows which leads are unjudged and why.

**Exports match the destination.** Two buttons, both honouring the current filters: a wide CSV with every field and the score reasons, and a CSV whose headers match HubSpot's company import so it maps with no clicks. Duplicates are excluded from both.

**Keyboard and safety.** Escape closes the drawer, the page scroll locks behind it, notes save on blur, and deleting an import asks first.

---

## Architecture

```
Browser (React 19 client components)
  │  fetch JSON / multipart
  ▼
Next.js 16 App Router (TypeScript, Node runtime)
  ├─ /                    Import page: dropzone, samples, recent batches (server component)
  ├─ /batches/[id]        Workspace: stats, progress loop, filters, table, drawer, weights (client)
  └─ /api/...             Route handlers (see API below)
        │
        ├─ lib/csv.ts          papaparse + header alias mapper
        ├─ lib/normalize.ts    domain/name/money/headcount normalization, Dice-coefficient dedupe
        ├─ lib/enrich/         fetcher (undici, robots, timeouts, block detection, proxy)
        │                      website (cheerio extraction, JSON-LD), rdap, validate (MX/DoH, libphonenumber)
        ├─ lib/scoring.ts      weighted, explainable score
        ├─ lib/ai.ts           Claude opener (Anthropic SDK) with template fallback
        └─ lib/db.ts           libSQL client + schema + enrichment cache
                │
                ▼
        SQLite file (local/Docker)  or  Turso libSQL (serverless)
```

**Frontend.** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4 with CSS-variable design tokens, lucide-react icons. The import page is a server component that reads recent batches directly from the database; the workspace is a client component because it drives the chunked enrichment loop and holds filter state. No global state library: one `fetch` → `setState` cycle per chunk keeps the table live.

**Backend.** Next.js route handlers on the Node runtime (not Edge, because cheerio, DNS and libSQL need Node APIs). Input validated with zod. Business logic lives in `src/lib` and is UI-independent so it can be exercised from the API or a script.

**Data storage.** libSQL (`@libsql/client`), SQLite-compatible. Three tables: `batches` (weights, target industries, column map, progress), `leads` (normalized fields + JSON columns for enrichment, validation and score breakdown), `enrichment_cache` (domain → payload, 7-day TTL). Locally it is a single file in `data/`; in the cloud the same client talks to Turso over HTTPS with `DATABASE_URL` + `DATABASE_AUTH_TOKEN`. SQLite was chosen over Postgres because the workload is a few thousand rows per user, JSON columns fit the semi-structured enrichment payload, and zero-setup matters for a 5-hour build that reviewers must run.

**Caching and performance.** (1) Per-domain enrichment cache in SQLite, 7-day TTL, so repeated imports and re-runs cost no HTTP. (2) In-process memoization of robots.txt, MX lookups and RDAP lookups for the life of the server. (3) `p-limit` concurrency of 4 fetches per chunk, 8-second timeouts, 1.5 MB body cap, secondary pages fetched in parallel. (4) Chunked processing with progressive UI updates, so time-to-first-result is one chunk, not the whole batch. (5) Preliminary scoring from CSV fields means the table is sortable before any network call.

**Hosting and deployment.** Two supported paths, both from the same code:

- *Serverless (recommended for the demo link):* **Vercel** (AWS us-east-1 under the hood). `git push` → Vercel builds with `next build`, route handlers become serverless functions (`maxDuration = 60` on the enrichment and opener routes), static assets go to the CDN. Set `DATABASE_URL`/`DATABASE_AUTH_TOKEN` to a **Turso** database (also on AWS/Fly edge). Cost at this scale: $0.
- *Container:* the included multi-stage `Dockerfile` (Next standalone output, ~150 MB image) runs on Fly.io, Render, AWS App Runner or GCP Cloud Run with a volume mounted at `/app/data` for the SQLite file.

The chunking, the DoH fallback and the externalized native packages (`serverExternalPackages` in `next.config.ts`) exist specifically so that the serverless path works without code changes.

**AI.** Optional. `POST /api/leads/:id/opener` calls `claude-opus-5` through the official Anthropic TypeScript SDK with the lead's enrichment facts and a strict "never invent facts, 90-130 words, no broker tone" system prompt; if there is no key, a refusal, or an API error, the same facts are rendered through a deterministic template so the button always works.

---

## API

All routes return JSON unless noted. Use them to automate the pipeline from scripts or a notebook.

| Method & path | Purpose |
|---|---|
| `POST /api/batches` (multipart `file` or `text`, optional `name`) | Import a CSV → `{ batch, warnings }` |
| `GET /api/batches` | List batches with stats |
| `GET /api/batches/:id` | Batch + all leads + stats |
| `DELETE /api/batches/:id` | Delete batch and leads |
| `POST /api/batches/:id/enrich?size=4` | Enrich the next `size` unprocessed leads → `{ processed, remaining, done }` |
| `POST /api/batches/:id/enrich?retry=failed` | Re-queue unreachable leads |
| `POST /api/batches/:id/rescore` `{ weights, targetIndustries }` | Re-score every lead |
| `GET /api/batches/:id/export?format=generic\|hubspot&ids=&minScore=&tiers=` | CSV download |
| `PATCH /api/leads/:id` `{ status?, notes? }` | Update workflow state |
| `POST /api/leads/:id/opener` | Generate outreach opener → `{ opener, source }` |
| `GET /api/health` | Storage / AI / proxy configuration check |

Example end-to-end from a shell:

```bash
curl -s -F "file=@public/samples/sample_leads.csv" -F "name=demo" localhost:3000/api/batches
# take batch.id from the response, then loop:
curl -s -X POST "localhost:3000/api/batches/<id>/enrich?size=4"
curl -s "localhost:3000/api/batches/<id>/export?format=hubspot" -o shortlist.csv
```

---

## Ethical data collection

- Only publicly served pages are read; nothing behind a login, no LinkedIn scraping, no third-party data brokers.
- `robots.txt` is fetched and honoured for every origin; disallowed sites are skipped and labelled.
- A descriptive User-Agent identifies the bot; set `SCRAPER_USER_AGENT` with your contact address before deploying.
- Requests are rate-limited by concurrency and one homepage plus at most three linked pages per company; results are cached for a week so no site is re-fetched on every run.
- Personal data (owner names, emails, phones) stays in the user's own database and exports; none is sent to third parties except the optional Claude call, which receives only the facts needed for the opener.

---

## Limitations and next steps

- Owner detection from unstructured pages is heuristic (first-name dictionary + title proximity). It favours precision; missed owners simply stay blank. SaaSquatch's own owner enrichment would fill this field via its API.
- Revenue and headcount are taken from the input; LeadLens does not estimate them. Pairing with SaaSquatch's "AI Power Revenue Estimates" is the natural integration.
- No authentication: this is a single-tenant tool intended to run per user or behind an existing login.
- Next: direct SaaSquatch API import instead of CSV, HubSpot/Pipedrive push via API, a "similar companies" expansion using the tech and industry signals, and a nightly re-verification job for saved leads.

---

## Repository layout

```
src/app/                 pages and API route handlers
src/components/          UI (UploadCard, BatchWorkspace, LeadDrawer, WeightsPanel, StatsTiles...)
src/lib/                 domain logic (csv, normalize, enrich/*, scoring, ai, db, service)
public/samples/          datasets described above
scripts/                 synthetic dataset generator
Dockerfile, .env.example
```

## Time spent

About 5 hours of engineering (scaffold, pipeline, scoring, UI, testing against live sites), plus research and documentation.
