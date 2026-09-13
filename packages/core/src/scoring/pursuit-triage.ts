/**
 * Go/No-Go packet from a parsed RFP/SOW.
 * PURE — no I/O. Extraction may be heuristic or model-filled; scoring is deterministic.
 */
import type {
  SolicitationExtraction,
  SolicitationRequirement,
  PursuitTriageView,
} from "@opportunity-engine/contracts";
import { computeOpportunityAlignment } from "./opportunity-alignment";
import {
  inferIcpVertical,
  matchBillityCapabilities,
  type CapabilityMatch,
} from "./billity-icp";

export interface OrgTriageContext {
  name: string;
  industry?: string;
  channel?: string;
  summary?: string;
}

const SOURCE_TEXT_CAP = 24_000;
const PASS_FAIL = /\b(pass[\s/-]*fail|mandatory|must have|shall possess|fedramp|ato\b|performance bond|bonding capacity)\b/i;

export function capSourceText(text: string): { text: string; truncated: boolean } {
  const normalized = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length <= SOURCE_TEXT_CAP) return { text: normalized, truncated: false };
  return { text: normalized.slice(0, SOURCE_TEXT_CAP), truncated: true };
}

export function mergeSolicitationExtractions(
  base: SolicitationExtraction,
  overlay: Partial<SolicitationExtraction> | null | undefined,
): SolicitationExtraction {
  if (!overlay) return base;
  const pickList = (preferred?: string[], fallback?: string[]) => {
    const next = (preferred ?? []).map(s => s.trim()).filter(Boolean);
    return next.length ? next.slice(0, 8) : (fallback ?? []).slice(0, 8);
  };
  const overlayReqs = (overlay.requirements ?? []).filter(r => r.requirementText?.trim());
  return {
    inferredName: overlay.inferredName?.trim() || base.inferredName,
    solicitationRef: overlay.solicitationRef?.trim() || base.solicitationRef,
    dueDate: overlay.dueDate !== undefined ? overlay.dueDate : base.dueDate,
    issuer: overlay.issuer?.trim() || base.issuer,
    objective: pickList(overlay.objective, base.objective),
    services: pickList(overlay.services, base.services),
    deliverables: pickList(overlay.deliverables, base.deliverables),
    requirements: overlayReqs.length ? overlayReqs.slice(0, 24) : base.requirements,
    responseSections: (overlay.responseSections?.length ? overlay.responseSections : base.responseSections).slice(0, 12),
    constraints: pickList(overlay.constraints, base.constraints).slice(0, 12),
  };
}

export function extractSolicitationHeuristic(text: string, filename: string): SolicitationExtraction {
  const stem = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const due = extractDueDate(text);
  const solicitationRef = extractSolicitationRef(text) || undefined;
  const requirements = extractRequirements(text);
  return {
    inferredName: extractTitle(text) || stem || "Untitled solicitation",
    solicitationRef,
    dueDate: due,
    issuer: extractIssuer(text),
    objective: sectionBullets(text, /(?:purpose|objective|overview|background)\b/i) ||
      sentencesMatching(text, /moderniz|replace|implement|retire|redesign|deploy/i, 4),
    services: sectionBullets(text, /(?:scope of (?:work|services)|services required|statement of work)\b/i) ||
      sentencesMatching(text, /integrat|platform|pipeline|analytics|payment|portal|migrat/i, 5),
    deliverables: sectionBullets(text, /deliverables?\b/i) ||
      sentencesMatching(text, /deliver|production|dashboard|training|cutover|rollout/i, 4),
    requirements,
    responseSections: extractResponseSections(text),
    constraints: sentencesMatching(text, /fedramp|hipaa|soc 2|iso 27001|bonding|ato\b|wcag|zero[- ]downtime/i, 6),
  };
}

export function scorePursuitTriage(input: {
  extraction: SolicitationExtraction;
  sourceText: string;
  lane: "B" | "C";
  org: OrgTriageContext;
  provider: "claude" | "gemini" | "heuristic";
  modelVersion: string;
}): PursuitTriageView {
  const { extraction, sourceText, lane, org, provider, modelVersion } = input;
  const reqs = extraction.requirements.length
    ? extraction.requirements
    : fallbackRequirements(extraction);
  const docMatches = matchBillityCapabilities(sourceText, "solicitation", "public_web");
  const reqmap = reqs.slice(0, 24).map(req => mapRequirement(req, docMatches));
  const mapped = reqmap.filter(r => r.status === "mapped");
  const passFailUnmapped = reqs.some((req, i) => {
    const row = reqmap[i];
    return Boolean(row && row.status === "unmapped" && (req.passFail || PASS_FAIL.test(req.requirementText)));
  });

  const totalRequired = Math.max(reqs.length, docMatches.length ? 4 : 1);
  const matchCount = mapped.length || Math.min(docMatches.length, totalRequired);
  const maturity = mapped.length
    ? 0.75
    : docMatches.length
      ? 0.45
      : 0.15;

  const sector = sectorFromOrg(org, sourceText);
  const alignment = computeOpportunityAlignment({
    capabilityMatchCount: matchCount,
    totalCapabilitiesRequired: totalRequired,
    matchMaturity: maturity,
    intentSignals: [
      { type: "rfp_released", confidence: 0.95, recency: 0 },
      ...(/(budget|funded|appropriat|board[- ]approved)/i.test(sourceText)
        ? [{ type: "budget_confirmed" as const, confidence: 0.7, recency: 30 }]
        : []),
    ],
    accountValue: {
      sector,
      sizeBand: "unknown",
      priorRelationship: /partner|referral|existing/i.test(org.channel ?? ""),
      multiYearPotential: /multi-?year|option year|phased|phase [0-9]/i.test(sourceText),
      referenceAccountPotential: /government|public_transit|healthcare/.test(sector),
    },
    isInbound: true,
  });

  let rec: PursuitTriageView["rec"] = "go";
  const coverage = reqmap.length ? mapped.length / reqmap.length : (docMatches.length ? 0.6 : 0.2);
  if (!sourceText.trim()) {
    rec = "pending";
  } else if (passFailUnmapped) {
    rec = "nogo";
  } else if (coverage >= 0.75 && alignment.total >= 68) {
    rec = "go";
  } else if (coverage >= 0.45 && alignment.total >= 52) {
    rec = "cond";
  } else {
    rec = "nogo";
  }

  const score = rec === "pending" ? 50 : alignment.total;
  const gaps = buildGaps(reqs, reqmap);
  const rfund = rfundFromText(sourceText, lane);
  const rationale = buildRationale({
    rec,
    coverage,
    mapped: mapped.length,
    total: reqmap.length,
    passFailUnmapped,
    docMatches,
    extraction,
    org,
    provider,
  });

  const confidence = rec === "pending"
    ? 0
    : Math.round(Math.min(92, 38 + mapped.length * 8 + (provider === "heuristic" ? 0 : 12) + coverage * 20));

  return {
    score,
    rec,
    confidence,
    status: rec === "pending"
      ? "New — awaiting extractable document text"
      : "Triage complete",
    rationale,
    reqmap,
    gaps,
    rfund,
    complianceMatrix: (extraction.responseSections ?? []).map((section, i) => ({
      ref: section.ref || `§ ${i + 1}`,
      title: section.title,
      sectionId: section.sectionId || slug(section.title) || `sec-${i + 1}`,
    })),
    decisionAction: rec === "pending"
      ? "Awaiting extractable solicitation text"
      : "Recommendation generated from uploaded solicitation, awaiting human confirmation",
    modelVersion,
    provider,
  };
}

function mapRequirement(req: SolicitationRequirement, docMatches: CapabilityMatch[]) {
  const matches = matchBillityCapabilities(req.requirementText, "requirement", "public_web");
  const hit = matches[0] ?? docMatches.find(m =>
    req.requirementText.toLowerCase().includes(m.label.split("/")[0]!.trim().toLowerCase().slice(0, 12)),
  );
  if (hit) {
    return {
      req: req.requirementText,
      status: "mapped" as const,
      node: hit.label,
      evidence: hit.evidence.slice(0, 180) || "Matched DataBillity capability taxonomy",
    };
  }
  return {
    req: req.requirementText,
    status: "unmapped" as const,
    node: null,
    evidence: req.passFail
      ? "Pass/fail criterion — no matching DataBillity capability node"
      : "No matching capability node at required specificity",
  };
}

function buildGaps(
  reqs: SolicitationRequirement[],
  reqmap: PursuitTriageView["reqmap"],
): PursuitTriageView["gaps"] {
  const gaps: PursuitTriageView["gaps"] = [];
  reqmap.forEach((row, i) => {
    if (row.status !== "unmapped") return;
    const req = reqs[i];
    const passFail = Boolean(req?.passFail || PASS_FAIL.test(row.req));
    gaps.push({
      id: `GAP-${120 + gaps.length}`,
      title: row.req.slice(0, 180),
      crit: passFail ? "Pass/fail criterion" : "Unmapped requirement",
      demand: "From uploaded solicitation",
      closure: passFail ? "Partner coverage or No-Go" : "Partner, hire, or scoped exception",
    });
  });
  return gaps.slice(0, 8);
}

function buildRationale(input: {
  rec: PursuitTriageView["rec"];
  coverage: number;
  mapped: number;
  total: number;
  passFailUnmapped: boolean;
  docMatches: CapabilityMatch[];
  extraction: SolicitationExtraction;
  org: OrgTriageContext;
  provider: string;
}): string[] {
  const lines: string[] = [];
  if (input.rec === "pending") {
    return ["Uploaded file did not yield extractable text. Re-upload a text PDF, Word, or plain-text solicitation."];
  }
  if (input.total) {
    lines.push(`${input.mapped} of ${input.total} extracted requirements mapped to DataBillity capabilities (${Math.round(input.coverage * 100)}% coverage).`);
  }
  if (input.passFailUnmapped) {
    lines.push("At least one unmapped requirement is pass/fail — sufficient to recommend No-Go until partner coverage is confirmed.");
  }
  if (input.docMatches.length) {
    lines.push(`Document language matches: ${input.docMatches.slice(0, 3).map(m => m.label).join("; ")}.`);
  }
  if (input.extraction.dueDate) {
    lines.push(`Response due ${input.extraction.dueDate}.`);
  }
  if (input.org.industry) {
    lines.push(`Account industry: ${input.org.industry}.`);
  }
  if (input.rec === "go") {
    lines.push("Scope is close enough to platform/consulting motion to proceed, pending human confirmation.");
  } else if (input.rec === "cond") {
    lines.push("Pursue only with conditions: close capability gaps or narrow scope before a full response.");
  } else {
    lines.push("Fit is too thin against the current capability graph for a full bid.");
  }
  if (input.provider === "heuristic") {
    lines.push("Extraction used the heuristic parser (no model key). Re-run with Gemini/Claude for a denser requirement shred.");
  }
  return lines.slice(0, 8);
}

function rfundFromText(text: string, lane: "B" | "C"): PursuitTriageView["rfund"] {
  const hay = text.toLowerCase();
  let score = 22;
  if (/\b(ai|machine learning|llm|agent|orchestrat)/.test(hay)) score += 28;
  if (/\b(data platform|lakehouse|cdp|identity|personalization)/.test(hay)) score += 18;
  if (/\b(moderniz|transform|greenfield)/.test(hay)) score += 10;
  if (/\b(hardware|install at|field service)/.test(hay)) score -= 12;
  score = Math.max(8, Math.min(88, score));
  const tier = score >= 55 ? "full" : score >= 30 ? "advisory" : "none";
  const note = score >= 55
    ? "Scope includes platform-advancement work (AI, data, or identity) relevant to Billity R&D."
    : score >= 30
      ? "Mostly configuration/integration — limited platform-advancement content identified."
      : "Replication or field-install heavy — negligible funding relevance.";
  return { lane, tier, score, note };
}

function fallbackRequirements(extraction: SolicitationExtraction): SolicitationRequirement[] {
  const fromLists = [...extraction.services, ...extraction.deliverables, ...extraction.constraints];
  return fromLists.slice(0, 10).map(requirementText => ({
    requirementText,
    passFail: PASS_FAIL.test(requirementText),
  }));
}

function sectorFromOrg(org: OrgTriageContext, text: string): string {
  const blob = `${org.industry ?? ""} ${org.name} ${text}`;
  const vertical = inferIcpVertical(blob);
  if (vertical) return vertical.sector;
  const industry = (org.industry ?? "").toLowerCase();
  if (/transit|transport/.test(industry)) return "public_transit";
  if (/health/.test(industry)) return "healthcare";
  if (/insur/.test(industry)) return "healthcare";
  if (/financ|bank|credit/.test(industry)) return "financial_services";
  if (/gov|public/.test(industry)) return "government";
  return industry.replace(/\s+/g, "_") || "unknown";
}

function extractTitle(text: string): string {
  const generic = /^(request for proposals?|statement of work|solicitation|rfp|sow|purpose|objective|overview|scope of work)$/i;
  const fromPurpose = sectionBullets(text, /purpose|objective/i)[0];
  if (fromPurpose && fromPurpose.length <= 110) {
    return fromPurpose.replace(/[.]+$/, "");
  }
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean).slice(0, 16);
  const named = lines.find(l =>
    /request for proposal|statement of work|solicitation/i.test(l)
    && l.length < 140
    && !generic.test(l),
  );
  if (named) {
    return named.replace(/^(request for proposal|rfp|statement of work|sow)[:\s-]*/i, "").trim() || named;
  }
  return lines.find(l =>
    l.length > 8
    && l.length < 90
    && !generic.test(l)
    && !/^(issued by|proposals? due|due date|page \d+)/i.test(l)
    && !/\b(?:RFP|RFQ|RFI|SOL)[-\s]*[A-Z0-9]/i.test(l)
  ) ?? "";
}

function extractSolicitationRef(text: string): string | null {
  const match = text.match(/\b(?:RFP|RFQ|RFI|SOL)[-\s]*[A-Z0-9][A-Z0-9-./]{2,}\b/i);
  return match?.[0]?.replace(/\s+/g, " ").trim() ?? null;
}

function extractDueDate(text: string): string | null {
  const match = text.match(
    /\b(?:due(?:\s+date)?|closing|submission deadline|proposals?\s+due)[:\s]+([A-Z][a-z]+ \d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/i,
  );
  const raw = match?.[1];
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return raw;
  return new Date(parsed).toISOString().slice(0, 10);
}

function extractIssuer(text: string): string | undefined {
  const match = text.match(/\b(?:issued by|issuing (?:agency|office)|prepared for)[:\s]+([^\n]{8,80})/i);
  return match?.[1]?.trim();
}

function extractRequirements(text: string): SolicitationRequirement[] {
  const out: SolicitationRequirement[] = [];
  const seen = new Set<string>();
  const push = (raw: string, sectionRef?: string) => {
    const requirementText = raw.replace(/\s+/g, " ").trim().slice(0, 500);
    const key = requirementText.toLowerCase();
    if (requirementText.length < 28 || seen.has(key)) return;
    seen.add(key);
    out.push({
      requirementText,
      sectionRef,
      passFail: PASS_FAIL.test(requirementText),
    });
  };

  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    const numbered = trimmed.match(/^(?:(?:section|sec\.?)\s*)?(\d+(?:\.\d+){0,3}|[A-Z]\.|[a-z]\))\s+(.{28,})$/);
    if (numbered && /\b(shall|must|required|provide|support|include)\b/i.test(numbered[2]!)) {
      push(numbered[2]!, numbered[1]);
    } else if (/^(?:the\s+)?(?:contractor|vendor|offeror|respondent)\s+shall\b/i.test(trimmed)) {
      push(trimmed);
    }
    if (out.length >= 24) return out;
  }

  if (out.length < 4) {
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      if (/\b(shall|must)\b/i.test(sentence)) push(sentence);
      if (out.length >= 16) break;
    }
  }
  return out.slice(0, 24);
}

function extractResponseSections(text: string): SolicitationExtraction["responseSections"] {
  const found: SolicitationExtraction["responseSections"] = [];
  const re = /(?:volume|vol\.?|section|attachment)\s+([IVX0-9.]+)[:\s]+([A-Z][^\n]{6,80})/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) && found.length < 8) {
    const title = match[2]!.replace(/[.]+$/, "").trim();
    found.push({
      ref: `${/vol/i.test(match[0]) ? "Vol" : "§"} ${match[1]}`.trim(),
      title,
      sectionId: slug(title),
    });
  }
  if (found.length) return found;
  return [
    { ref: "Approach", title: "Technical Approach", sectionId: "tech" },
    { ref: "Scope", title: "Scope Response", sectionId: "scope" },
    { ref: "Delivery", title: "Management & Delivery", sectionId: "mgmt" },
  ];
}

function sectionBullets(text: string, heading: RegExp): string[] {
  const match = heading.exec(text);
  if (!match || match.index === undefined) return [];
  const rest = text.slice(match.index + match[0].length);
  const nextHeading = rest.search(/\n[A-Z][A-Za-z0-9 /&]{6,40}\n/);
  const body = rest.slice(0, nextHeading > 80 ? nextHeading : 1400);
  const items = body
    .split(/\n+/)
    .map(line => line.replace(/^[\s\-•*0-9.)]+/, "").trim())
    .filter(line => line.length > 24 && line.length < 280 && !heading.test(line));
  return items.slice(0, 5);
}

function sentencesMatching(text: string, pattern: RegExp, limit: number): string[] {
  const items: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const trimmed = sentence.replace(/\s+/g, " ").trim();
    if (trimmed.length > 28 && trimmed.length < 280 && pattern.test(trimmed)) {
      items.push(trimmed);
    }
    if (items.length >= limit) break;
  }
  return items;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
}
