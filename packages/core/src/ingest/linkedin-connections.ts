/**
 * LinkedIn Connections.csv ingest — DISC-13 bulk list evaluation.
 * Parse → classify → entity-resolve companies → score. Pure: no I/O.
 */
import { computeOpportunityAlignment } from "../scoring/opportunity-alignment";
import type { IntentSignal } from "../scoring/opportunity-alignment";
import { normalizeLegalName } from "../entity-resolution";
import {
  inferIcpVertical,
  matchBillityCapabilities,
  commercialMotionOf,
  type IcpVerticalId,
} from "../scoring/billity-icp";

export const LINKEDIN_BATCH_THRESHOLDS = {
  pipeline: 62,
  discovery: 40,
} as const;

/** Option 3: score ≥ 62 and (ICP vertical or platform/consulting capability). */
export function isQualifiedPipelineLead(lead: {
  score: number;
  icpVertical: IcpVerticalId | null;
  commercialMotion: "platform" | "consulting" | "both" | "none";
  excludeReason: string | null;
}): boolean {
  if (lead.excludeReason) return false;
  if (lead.score < LINKEDIN_BATCH_THRESHOLDS.pipeline) return false;
  return Boolean(lead.icpVertical) || lead.commercialMotion !== "none";
}

export interface LinkedInConnectionRow {
  firstName: string;
  lastName: string;
  url: string;
  email: string;
  company: string;
  position: string;
  connectedOn: string;
  rowNumber: number;
}

export type SeniorityBand =
  | "intern_student"
  | "recruiter"
  | "founder"
  | "c_level"
  | "evp_svp"
  | "vp"
  | "head"
  | "director"
  | "partner"
  | "principal"
  | "manager_lead"
  | "sales"
  | "consultant"
  | "ic"
  | "other"
  | "unknown";

export type RoutingOutcome = "pipeline" | "discovery" | "parked";

export interface EvaluatedLead {
  rowNumber: number;
  fullName: string;
  firstName: string;
  lastName: string;
  url: string;
  email: string | null;
  companyRaw: string;
  companyKey: string;
  position: string;
  connectedOn: string;
  connectedAt: string | null;
  recencyDays: number | null;
  seniorityBand: SeniorityBand;
  industry: string;
  sector: string;
  sizeBand: string;
  icpVertical: IcpVerticalId | null;
  icpTags: string[];
  commercialMotion: "platform" | "consulting" | "both" | "none";
  excludeReason: string | null;
  routing: RoutingOutcome;
  score: number;
  scoreComponents: {
    capabilityAlignment: number;
    intentTiming: number;
    accountValueFit: number;
  };
  whyGoodFit: string;
}

export interface ResolvedAccount {
  key: string;
  legalName: string;
  aliases: string[];
  sector: string;
  industry: string;
  sizeBand: string;
  icpVertical: IcpVerticalId | null;
  leads: EvaluatedLead[];
  bestScore: number;
  routing: RoutingOutcome;
}

export interface LinkedInBatchResult {
  rowCount: number;
  skippedEmpty: number;
  excluded: number;
  evaluated: number;
  accounts: ResolvedAccount[];
  leads: EvaluatedLead[];
  routingCounts: Record<RoutingOutcome, number>;
  seniorityCounts: Record<string, number>;
  industryCounts: Record<string, number>;
  emailCount: number;
  uniqueCompanies: number;
  qualifiedCount: number;
}

const ENTERPRISE = new Set([
  "microsoft", "amazon", "amazon web services aws", "google", "meta", "apple",
  "walmart", "starbucks", "walmart", "t-mobile", "nordstrom", "costco",
  "walmart", "delta air lines", "air canada", "alaska airlines", "visa",
  "mastercard", "paypal", "stripe", "capital one", "u s bank", "us bank",
  "scotiabank", "bmo commercial bank", "first citizens bank", "the walt disney company",
  "walt disney parks and resorts online", "lululemon", "shopify", "salesforce",
  "ibm", "oracle", "adobe", "intel", "nvidia", "netflix", "uber", "airbnb",
  "deloitte", "accenture", "kpmg", "pwc", "ey", "slalom", "mckinsey",
  "city of seattle", "university of washington", "costco wholesale",
  "the home depot", "target", "nike", "boeing", "expedia", "tableau",
]);

const KNOWN_INDUSTRY: Record<string, { industry: string; sector: string }> = {
  microsoft: { industry: "Technology", sector: "technology" },
  amazon: { industry: "Retail & Cloud", sector: "retail" },
  "amazon web services aws": { industry: "Cloud Infrastructure", sector: "technology" },
  google: { industry: "Technology", sector: "technology" },
  meta: { industry: "Technology", sector: "technology" },
  "t-mobile": { industry: "Telecommunications", sector: "telecom" },
  starbucks: { industry: "Retail", sector: "retail" },
  walmart: { industry: "Retail", sector: "retail" },
  shopify: { industry: "E-commerce platforms", sector: "ecommerce" },
  stripe: { industry: "Payments & Fintech", sector: "financial_services" },
  visa: { industry: "Payments & Fintech", sector: "financial_services" },
  mastercard: { industry: "Payments & Fintech", sector: "financial_services" },
  paypal: { industry: "Payments & Fintech", sector: "financial_services" },
  "capital one": { industry: "Banking", sector: "financial_services" },
  "u s bank": { industry: "Banking", sector: "financial_services" },
  "bill com": { industry: "Payments & Fintech", sector: "financial_services" },
  bill: { industry: "Payments & Fintech", sector: "financial_services" },
  "apptech payments corp": { industry: "Payments & Fintech", sector: "financial_services" },
  "global payments inc": { industry: "Payments & Fintech", sector: "financial_services" },
  "bluefin payment systems": { industry: "Payments & Fintech", sector: "financial_services" },
  cardflight: { industry: "Payments & Fintech", sector: "financial_services" },
  "celero commerce": { industry: "Payments & Fintech", sector: "financial_services" },
  "city of seattle": { industry: "Government", sector: "government" },
  "unify consulting": { industry: "Consulting", sector: "professional_services" },
  slalom: { industry: "Consulting", sector: "professional_services" },
  deloitte: { industry: "Consulting", sector: "professional_services" },
  "air canada": { industry: "Airlines", sector: "travel" },
  "alaska airlines": { industry: "Airlines", sector: "travel" },
  "delta air lines": { industry: "Airlines", sector: "travel" },
  nordstrom: { industry: "Retailers", sector: "retail" },
  lululemon: { industry: "Retailers", sector: "retail" },
  aritzia: { industry: "Retailers", sector: "retail" },
  "giant eagle, inc.": { industry: "Retailers", sector: "retail" },
  "outrigger hospitality group": { industry: "Hospitality & hospitality solutions", sector: "hospitality" },
  airbnb: { industry: "Hospitality & hospitality solutions", sector: "hospitality" },
  hahnair: { industry: "Airlines", sector: "travel" },
  "university of washington": { industry: "Education", sector: "education" },
};

const ICP_PATTERNS: Array<{ tag: string; pattern: RegExp }> = [
  { tag: "payments", pattern: /payment|billing|merchant|acquir|issuing|checkout|wallet|\bpos\b|fintech|\biso\b|payfac|cardflight|visa|mastercard|paypal|stripe|bill\.com|ixopay|billtrust/i },
  { tag: "loyalty", pattern: /loyalty|rewards|lifecycle marketing|\bcrm\b|retention/i },
  { tag: "data_ai", pattern: /\bai\b|artificial intelligence|machine learning|\bml\b|data architect|analytics|mlops|databricks|genai|snowflake/i },
  { tag: "agency", pattern: /marketing agency|digital agency|advertising|media agency/i },
  { tag: "automotive", pattern: /automotiv|dealership|dealer group|\boem\b|\bcdk\b/i },
  { tag: "ecommerce", pattern: /e-?commerce|shopify|bigcommerce|magento/i },
  { tag: "hospitality", pattern: /hospitality|hotel|resort|guest experience/i },
  { tag: "airline", pattern: /airline|aviation|airways/i },
  { tag: "retail", pattern: /retail|grocery|apparel/i },
];

const SENIORITY_MATURITY: Record<SeniorityBand, number> = {
  intern_student: 0.1,
  recruiter: 0.2,
  founder: 0.92,
  c_level: 0.95,
  evp_svp: 0.88,
  vp: 0.82,
  head: 0.78,
  director: 0.72,
  partner: 0.8,
  principal: 0.68,
  manager_lead: 0.5,
  sales: 0.45,
  consultant: 0.4,
  ic: 0.3,
  other: 0.35,
  unknown: 0.25,
};

export function parseLinkedInConnectionsCsv(csvText: string): LinkedInConnectionRow[] {
  const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => /^First Name,/i.test(l));
  if (headerIdx < 0) {
    throw new Error("Not a LinkedIn Connections.csv export — missing First Name header");
  }
  const table = lines.slice(headerIdx).join("\n");
  const records = parseCsv(table);
  const header = records[0] ?? [];
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const iFirst = col("First Name");
  const iLast = col("Last Name");
  const iUrl = col("URL");
  const iEmail = col("Email Address");
  const iCompany = col("Company");
  const iPosition = col("Position");
  const iConnected = col("Connected On");

  const rows: LinkedInConnectionRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const rec = records[i]!;
    if (rec.every((c) => !c.trim())) continue;
    rows.push({
      firstName: (rec[iFirst] ?? "").trim(),
      lastName: (rec[iLast] ?? "").trim(),
      url: (rec[iUrl] ?? "").trim(),
      email: (rec[iEmail] ?? "").trim(),
      company: (rec[iCompany] ?? "").trim(),
      position: (rec[iPosition] ?? "").trim(),
      connectedOn: (rec[iConnected] ?? "").trim(),
      rowNumber: headerIdx + i + 1,
    });
  }
  return rows;
}

export function evaluateLinkedInBatch(rows: LinkedInConnectionRow[]): LinkedInBatchResult {
  const evaluated: EvaluatedLead[] = [];
  let skippedEmpty = 0;
  let excluded = 0;

  const companyNames = new Map<string, string>();
  for (const row of rows) {
    if (row.company) {
      const key = normalizeCompanyKey(row.company);
      const prev = companyNames.get(key);
      if (!prev || row.company.length > prev.length) companyNames.set(key, row.company);
    }
  }
  const canonicalKeys = mergeCompanyKeys([...companyNames.keys()]);

  for (const row of rows) {
    const fullName = `${row.firstName} ${row.lastName}`.replace(/\s+/g, " ").trim();
    if (!fullName) {
      skippedEmpty++;
      continue;
    }

    const companyRaw = row.company;
    const rawKey = companyRaw ? normalizeCompanyKey(companyRaw) : "unattributed";
    const companyKey = companyRaw ? (canonicalKeys.get(rawKey) ?? rawKey) : "unattributed";
    const seniority = classifySeniority(row.position);
    const profileText = `${row.position} ${companyRaw}`;
    const vertical = inferIcpVertical(profileText, companyKey);
    const inferred = inferIndustry(companyRaw, row.position, companyKey);
    const industry = vertical?.industry ?? inferred.industry;
    const sector = vertical?.sector ?? inferred.sector;
    const sizeBand = inferSizeBand(companyKey, companyRaw);
    const capabilityMatches = matchBillityCapabilities(
      profileText,
      row.url || `row:${row.rowNumber}`,
      "linkedin_profile",
    );
    const icpTags = [
      ...new Set([
        ...(vertical ? [vertical.id] : []),
        ...capabilityMatches.map((m) => m.capabilityId),
        ...detectIcpTags(profileText),
      ]),
    ];
    const connectedAt = parseConnectedOn(row.connectedOn);
    const recencyDays = connectedAt ? daysSince(connectedAt) : null;
    const excludeReason = exclusionReason(fullName, companyRaw, seniority, row.position);

    const scoreOut = computeOpportunityAlignment({
      capabilityMatchCount: Math.min(capabilityMatches.length + (vertical ? 1 : 0), 3),
      totalCapabilitiesRequired: 3,
      matchMaturity: SENIORITY_MATURITY[seniority],
      intentSignals: buildIntentSignals(recencyDays, seniority),
      accountValue: {
        sector,
        sizeBand,
        priorRelationship: true,
        multiYearPotential: isDecisionMaker(seniority),
        referenceAccountPotential: ENTERPRISE.has(companyKey) || sizeBand === "enterprise",
      },
      isInbound: false,
    });

    let score = scoreOut.total;
    if (excludeReason) score = Math.min(score, 25);
    if (!companyRaw) score = Math.min(score, 38);
    if (seniority === "recruiter") score = Math.min(score, 42);
    if (vertical && isDecisionMaker(seniority)) score = Math.min(100, score + 10);
    else if (vertical) score = Math.min(100, score + 6);
    const motion = commercialMotionOf(capabilityMatches);
    if (motion === "consulting" || motion === "both") {
      score = Math.min(100, score + (isDecisionMaker(seniority) ? 8 : 4));
    }
    if (motion === "platform" || motion === "both") {
      score = Math.min(100, score + (isDecisionMaker(seniority) ? 6 : 3));
    }

    const routing: RoutingOutcome = isQualifiedPipelineLead({
      score,
      icpVertical: vertical?.id ?? null,
      commercialMotion: motion,
      excludeReason,
    })
      ? "pipeline"
      : "parked";

    if (excludeReason) excluded++;

    evaluated.push({
      rowNumber: row.rowNumber,
      fullName,
      firstName: row.firstName,
      lastName: row.lastName,
      url: row.url,
      email: row.email || null,
      companyRaw,
      companyKey,
      position: row.position,
      connectedOn: row.connectedOn,
      connectedAt: connectedAt ? connectedAt.toISOString() : null,
      recencyDays,
      seniorityBand: seniority,
      industry,
      sector,
      sizeBand,
      icpVertical: vertical?.id ?? null,
      icpTags,
      commercialMotion: motion,
      excludeReason,
      routing,
      score,
      scoreComponents: {
        capabilityAlignment: scoreOut.capabilityAlignment,
        intentTiming: scoreOut.intentTiming,
        accountValueFit: scoreOut.accountValueFit,
      },
      whyGoodFit: buildWhy(seniority, icpTags, companyRaw, recencyDays, excludeReason, vertical?.industry, motion),
    });
  }

  const accounts = rollupAccounts(evaluated, companyNames, canonicalKeys);
  const routingCounts: Record<RoutingOutcome, number> = { pipeline: 0, discovery: 0, parked: 0 };
  const seniorityCounts: Record<string, number> = {};
  const industryCounts: Record<string, number> = {};
  for (const lead of evaluated) {
    routingCounts[lead.routing]++;
    seniorityCounts[lead.seniorityBand] = (seniorityCounts[lead.seniorityBand] ?? 0) + 1;
    industryCounts[lead.industry] = (industryCounts[lead.industry] ?? 0) + 1;
  }

  return {
    rowCount: rows.length,
    skippedEmpty,
    excluded,
    evaluated: evaluated.length,
    accounts,
    leads: evaluated,
    routingCounts,
    seniorityCounts,
    industryCounts,
    emailCount: evaluated.filter((l) => !!l.email).length,
    uniqueCompanies: accounts.length,
    qualifiedCount: evaluated.filter((l) => l.routing === "pipeline").length,
  };
}

function rollupAccounts(
  leads: EvaluatedLead[],
  displayNames: Map<string, string>,
  canonicalKeys: Map<string, string>,
): ResolvedAccount[] {
  const byKey = new Map<string, EvaluatedLead[]>();
  for (const lead of leads) {
    const list = byKey.get(lead.companyKey) ?? [];
    list.push(lead);
    byKey.set(lead.companyKey, list);
  }

  const accounts: ResolvedAccount[] = [];
  for (const [key, group] of byKey) {
    const aliases = new Set<string>();
    for (const lead of group) {
      if (lead.companyRaw) aliases.add(lead.companyRaw);
    }
    const legalName =
      (key !== "unattributed" ? displayNames.get(key) : null) ??
      [...aliases][0] ??
      (key === "unattributed" ? "Unattributed — LinkedIn" : key);

    const best = group.reduce((a, b) => (a.score >= b.score ? a : b));
    const accountRouting: RoutingOutcome =
      group.some((l) => l.routing === "pipeline") ? "pipeline"
        : group.some((l) => l.routing === "discovery") ? "discovery"
          : "parked";

    accounts.push({
      key,
      legalName,
      aliases: [...aliases],
      sector: best.sector,
      industry: best.industry,
      sizeBand: best.sizeBand,
      icpVertical: best.icpVertical,
      leads: group.sort((a, b) => b.score - a.score),
      bestScore: best.score,
      routing: accountRouting,
    });
  }

  void canonicalKeys;
  return accounts.sort((a, b) => b.bestScore - a.bestScore);
}

function mergeCompanyKeys(keys: string[]): Map<string, string> {
  const sorted = [...keys].sort((a, b) => b.length - a.length);
  const canonical = new Map<string, string>();
  for (const key of sorted) {
    let parent: string | null = null;
    for (const [child, canon] of canonical) {
      if (isCompanyMatch(key, child) || isCompanyMatch(key, canon)) {
        parent = canon;
        break;
      }
    }
    canonical.set(key, parent ?? key);
  }
  return canonical;
}

function isCompanyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  return a.includes(b) || b.includes(a);
}

function normalizeCompanyKey(name: string): string {
  return normalizeLegalName(name)
    .replace(/\b(the|and|of)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifySeniority(title: string): SeniorityBand {
  const t = title.toLowerCase();
  if (!t) return "unknown";
  if (/\bintern\b|\bstudent\b|graduate/.test(t)) return "intern_student";
  if (/recruiter|talent acquisition|talent partner|sourcer/.test(t)) return "recruiter";
  if (/founder|co-founder|cofounder|founding/.test(t)) return "founder";
  if (/\b(ceo|cto|cmo|cro|cio|cfo|coo|cpo|cao|ciso|chief)\b/.test(t) || /^president\b/.test(t) || /\bpresident\b/.test(t)) {
    return "c_level";
  }
  if (/\b(evp|svp|executive vice|senior vice president)\b/.test(t)) return "evp_svp";
  if (/\b(vp|vice president|vice-president)\b/.test(t)) return "vp";
  if (/\bhead of\b|^head\b/.test(t)) return "head";
  if (/director/.test(t)) return "director";
  if (/\b(managing partner|equity partner|general counsel|shareholder)\b/.test(t)) return "partner";
  if (/\b(principal|gm|general manager)\b/.test(t)) return "principal";
  if (/account executive|\bae\b|bdr|sdr|sales executive|business development/.test(t)) return "sales";
  if (/manager|\blead\b/.test(t)) return "manager_lead";
  if (/consultant|advisor|adviser/.test(t)) return "consultant";
  if (/engineer|developer|analyst|designer|specialist|associate|scientist|attorney|counsel/.test(t)) return "ic";
  if (/owner|board member/.test(t)) return "founder";
  return "other";
}

function inferIndustry(company: string, position: string, companyKey: string): { industry: string; sector: string } {
  const known = KNOWN_INDUSTRY[companyKey];
  if (known) return known;
  const vertical = inferIcpVertical(`${company} ${position}`, companyKey);
  if (vertical) return { industry: vertical.industry, sector: vertical.sector };
  const blob = `${company} ${position}`;
  if (/payment|fintech|billing|acquiring|wallet|card\b/i.test(blob)) return { industry: "Payments & Fintech", sector: "financial_services" };
  if (/\bbank\b|credit union|lending/i.test(blob)) return { industry: "Banking", sector: "financial_services" };
  if (/health|hospital|clinic|pharma/i.test(blob)) return { industry: "Healthcare", sector: "healthcare" };
  if (/insurance|underwrit|claims/i.test(blob)) return { industry: "Insurance", sector: "insurance" };
  if (/transit|government|public sector|city of|county|federal/i.test(blob)) return { industry: "Government", sector: "government" };
  if (/airline|hotel|travel|hospitality/i.test(blob)) return { industry: "Travel & Hospitality", sector: "travel" };
  if (/retail|commerce|shopify|marketplace/i.test(blob)) return { industry: "Retail", sector: "retail" };
  if (/consult|advisory|slalom|deloitte|accenture/i.test(blob)) return { industry: "Consulting", sector: "professional_services" };
  if (/software|saas|cloud|technology|ai\b/i.test(blob)) return { industry: "Technology", sector: "technology" };
  if (/law|attorney|counsel|legal/i.test(blob)) return { industry: "Legal", sector: "professional_services" };
  if (/universit|college|school/i.test(blob)) return { industry: "Education", sector: "education" };
  if (/telecom|wireless|mobile/i.test(blob)) return { industry: "Telecommunications", sector: "telecom" };
  if (!company) return { industry: "Unknown", sector: "unknown" };
  return { industry: "Unknown", sector: "unknown" };
}

function inferSizeBand(companyKey: string, companyRaw: string): string {
  if (ENTERPRISE.has(companyKey)) return "enterprise";
  if (/self-?employed|self employed|freelance|independent/i.test(companyRaw)) return "independent";
  if (/stealth/i.test(companyRaw)) return "startup";
  if (!companyRaw) return "unknown";
  return "unknown";
}

function detectIcpTags(blob: string): string[] {
  return ICP_PATTERNS.filter((p) => p.pattern.test(blob)).map((p) => p.tag);
}

function isDecisionMaker(s: SeniorityBand): boolean {
  return ["founder", "c_level", "evp_svp", "vp", "head", "director", "partner", "principal"].includes(s);
}

function exclusionReason(name: string, company: string, seniority: SeniorityBand, position: string): string | null {
  if (/databillity/i.test(company) || /databillity/i.test(name)) return "internal_employee";
  if (seniority === "intern_student") return "intern_or_student";
  if (/retired/i.test(position)) return "retired";
  return null;
}

function parseConnectedOn(value: string): Date | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  return null;
}

function daysSince(date: Date): number {
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 86_400_000));
}

function buildIntentSignals(recencyDays: number | null, seniority: SeniorityBand): IntentSignal[] {
  const recency = recencyDays ?? 730;
  const signals: IntentSignal[] = [
    { type: "prior_relationship", confidence: 0.85, recency },
  ];
  if (recency <= 45 && isDecisionMaker(seniority)) {
    signals.push({ type: "public_statement", confidence: 0.4, recency });
  }
  return signals;
}

function buildWhy(
  seniority: SeniorityBand,
  icpTags: string[],
  company: string,
  recencyDays: number | null,
  excludeReason: string | null,
  icpIndustry?: string,
  motion?: "platform" | "consulting" | "both" | "none",
): string {
  if (excludeReason === "internal_employee") return "Internal DataBillity contact — excluded from sales routing.";
  if (excludeReason === "intern_or_student") return "Intern/student — parked, not a buying-role lead.";
  const parts: string[] = [];
  if (motion === "consulting") parts.push("Consulting fit (custom dev / BI / compliance / data)");
  else if (motion === "platform") parts.push("Billity AI platform fit");
  else if (motion === "both") parts.push("Platform + consulting fit");
  if (icpIndustry) parts.push(`ICP vertical: ${icpIndustry}`);
  if (isDecisionMaker(seniority)) parts.push(`${seniority.replace(/_/g, " ")} buying-role`);
  if (icpTags.length) parts.push(`signals: ${icpTags.slice(0, 4).join(", ")}`);
  if (company) parts.push(`at ${company}`);
  if (recencyDays !== null && recencyDays <= 90) parts.push("connected in last 90 days");
  parts.push("prior LinkedIn relationship");
  return parts.join(" · ");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") {
      cell += c;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
