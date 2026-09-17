export type LeadStatus = "new" | "qualified" | "contacted" | "rejected";

export type Tier = "A" | "B" | "C" | "D";

export interface ScoreWeights {
  revenue: number;
  employees: number;
  maturity: number;
  owner: number;
  contactability: number;
  upside: number;
  industry: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  revenue: 25,
  employees: 15,
  maturity: 15,
  owner: 15,
  contactability: 15,
  upside: 10,
  industry: 5,
};

/** Industries that are fragmented, owner-operated, and classically ETA-friendly. */
export const DEFAULT_TARGET_INDUSTRIES = [
  "hvac",
  "plumbing",
  "electrical",
  "landscaping",
  "roofing",
  "construction",
  "manufacturing",
  "distribution",
  "wholesale",
  "logistics",
  "trucking",
  "accounting",
  "dental",
  "veterinary",
  "home health",
  "staffing",
  "it services",
  "managed services",
  "commercial cleaning",
  "pest control",
  "auto repair",
  "printing",
  "packaging",
  "machining",
  "engineering services",
  "environmental services",
  "security services",
  "insurance agency",
  "property management",
];

export interface ScoreComponent {
  key: keyof ScoreWeights;
  label: string;
  weight: number;
  /** 0..1 fraction of the weight that was earned */
  ratio: number;
  points: number;
  reason: string;
}

export interface ScoreResult {
  score: number;
  tier: Tier;
  components: ScoreComponent[];
  penalties: { label: string; points: number }[];
  flags: string[];
}

export interface EmailValidation {
  email: string;
  syntaxValid: boolean;
  mxFound: boolean;
  disposable: boolean;
  roleBased: boolean;
  matchesCompanyDomain: boolean | null;
  verdict: "valid" | "risky" | "invalid";
}

export interface PhoneValidation {
  raw: string;
  e164: string | null;
  national: string | null;
  valid: boolean;
  country: string | null;
}

export interface WebsiteEnrichment {
  fetchedUrl: string | null;
  httpStatus: number | null;
  reachable: boolean;
  blocked: boolean;
  robotsDisallowed: boolean;
  title: string | null;
  description: string | null;
  emails: string[];
  phones: string[];
  socials: Record<string, string>;
  foundedYear: number | null;
  copyrightStartYear: number | null;
  ownerHints: string[];
  ownershipSignals: string[];
  techSignals: string[];
  hasCareersPage: boolean;
  hasBlog: boolean;
  usesHttps: boolean;
  pagesScanned: string[];
  jsonLd: {
    type?: string;
    name?: string;
    telephone?: string;
    email?: string;
    founder?: string;
    foundingDate?: string;
    address?: string;
  } | null;
  domainRegistered: string | null;
  domainAgeYears: number | null;
  error: string | null;
  cached: boolean;
  fetchedAt: string;
}

export interface Validation {
  emails: EmailValidation[];
  phones: PhoneValidation[];
  bestEmail: string | null;
  bestPhone: string | null;
  contactable: boolean;
}

export interface Lead {
  id: string;
  batchId: string;
  company: string;
  website: string | null;
  domain: string | null;
  industry: string | null;
  location: string | null;
  employees: number | null;
  revenue: number | null;
  ownerName: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  sourceRow: Record<string, string>;
  enrichment: WebsiteEnrichment | null;
  validation: Validation | null;
  score: number | null;
  tier: Tier | null;
  scoreBreakdown: ScoreResult | null;
  dedupeOf: string | null;
  status: LeadStatus;
  notes: string | null;
  opener: string | null;
  enrichedAt: string | null;
  createdAt: string;
}

export interface Batch {
  id: string;
  name: string;
  createdAt: string;
  total: number;
  processed: number;
  duplicates: number;
  status: "pending" | "processing" | "done";
  weights: ScoreWeights;
  targetIndustries: string[];
  columnMap: Record<string, string | null>;
}

export interface BatchStats {
  total: number;
  unique: number;
  duplicates: number;
  processed: number;
  tierCounts: Record<Tier, number>;
  contactable: number;
  ownerIdentified: number;
  avgScore: number | null;
  blocked: number;
  unreachable: number;
  peOwned: number;
}
