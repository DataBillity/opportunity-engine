/**
 * Go/No-Go (or Respond/Pass for RFIs) packet from a parsed solicitation.
 * PURE — no I/O. Extraction may be heuristic or model-filled; scoring is deterministic.
 */
import type {
  SolicitationExtraction,
  SolicitationRequirement,
  PursuitTriageView,
  ProjectType,
} from "@opportunity-engine/contracts";
import { computeOpportunityAlignment, type IntentSignal } from "./opportunity-alignment";
import {
  inferIcpVertical,
  matchBillityCapabilities,
  type CapabilityMatch,
} from "./billity-icp";
import {
  recDecisionLabel,
  resolveProjectType,
  thresholdsFor,
} from "./project-type";

export interface OrgTriageContext {
  name: string;
  industry?: string;
  channel?: string;
  summary?: string;
}

const PASS_FAIL = /\b(pass[\s/-]*fail|mandatory|must have|shall possess|fedramp|ato\b|performance bond|bonding capacity)\b/i;
const RFI_ELIGIBILITY = /\b(must be registered|mandatory registration|eligibility|nda required|non[- ]disclosure)\b/i;
const INFO_REQUEST = /\b(provide information|please (?:describe|provide|explain|identify|outline)|how would you|what (?:is|are) your)\b/i;

export function capSourceText(text: string): { text: string; truncated: boolean } {
  const normalized = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: normalized, truncated: false };
}

export function mergeSolicitationExtractions(
  base: SolicitationExtraction,
  overlay: Partial<SolicitationExtraction> | null | undefined,
): SolicitationExtraction {
  if (!overlay) return base;
  const pickList = (preferred?: string[], fallback?: string[]) => {
    const next = (preferred ?? []).map(s => s.trim()).filter(Boolean);
    return next.length ? next : (fallback ?? []);
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
    requirements: overlayReqs.length ? overlayReqs : base.requirements,
    responseSections: overlay.responseSections?.length ? overlay.responseSections : base.responseSections,
    constraints: pickList(overlay.constraints, base.constraints),
  };
}

export function extractSolicitationHeuristic(
  text: string,
  filename: string,
  projectType: ProjectType = "rfp",
): SolicitationExtraction {
  const stem = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const due = extractDueDate(text);
  const solicitationRef = extractSolicitationRef(text) || undefined;
  const requirements = extractRequirements(text, projectType);
  return {
    inferredName: extractTitle(text, projectType) || stem || "Untitled solicitation",
    solicitationRef,
    dueDate: due,
    issuer: extractIssuer(text),
    objective: sectionBullets(text, /(?:purpose|objective|overview|background)\b/i) ||
      sentencesMatching(text, /moderniz|replace|implement|retire|redesign|deploy/i),
    services: sectionBullets(text, /(?:scope of (?:work|services)|services required|statement of work)\b/i) ||
      sentencesMatching(text, /integrat|platform|pipeline|analytics|payment|portal|migrat/i),
    deliverables: sectionBullets(text, /deliverables?\b/i) ||
      sentencesMatching(text, /deliver|production|dashboard|training|cutover|rollout/i),
    requirements,
    responseSections: extractResponseSections(text, projectType),
    constraints: sentencesMatching(text, /fedramp|hipaa|soc 2|iso 27001|bonding|ato\b|wcag|zero[- ]downtime/i),
  };
}

export function scorePursuitTriage(input: {
  extraction: SolicitationExtraction;
  sourceText: string;
  lane: "B" | "C";
  projectType?: ProjectType;
  filename?: string;
  org: OrgTriageContext;
  provider: "claude" | "gemini" | "heuristic";
  modelVersion: string;
}): PursuitTriageView {
  const { extraction, sourceText, lane, org, provider, modelVersion } = input;
  const resolved = resolveProjectType({
    selected: input.projectType,
    lane,
    text: sourceText,
    filename: input.filename,
  });
  const projectType = resolved.projectType;
  const thresholds = thresholdsFor(projectType);

  const reqs = normalizeRequirements(
    extraction.requirements.length ? extraction.requirements : fallbackRequirements(extraction),
    projectType,
  );
  const docMatches = matchBillityCapabilities(sourceText, "solicitation", "public_web");
  const reqmap = reqs.map(req => mapRequirement(req, docMatches, projectType));
  const mapped = reqmap.filter(r => r.status === "mapped");
  const passFailUnmapped = projectType !== "rfi" && reqs.some((req, i) => {
    const row = reqmap[i];
    return Boolean(row && row.status === "unmapped" && (req.passFail || PASS_FAIL.test(req.requirementText)));
  });

  const totalRequired = Math.max(reqs.length, 1);
  const matchCount = projectType === "rfi"
    ? (mapped.length || Math.min(docMatches.length, totalRequired))
    : mapped.length;
  const maturity = mapped.length
    ? 0.75
    : projectType === "rfi" && docMatches.length
      ? 0.5
      : 0.15;

  const sector = sectorFromOrg(org, sourceText);
  const alignment = computeOpportunityAlignment({
    capabilityMatchCount: matchCount,
    totalCapabilitiesRequired: totalRequired,
    matchMaturity: maturity,
    intentSignals: intentSignalsFor(projectType, sourceText),
    accountValue: {
      sector,
      sizeBand: "unknown",
      priorRelationship: /partner|referral|existing/i.test(org.channel ?? ""),
      multiYearPotential: /multi-?year|option year|phased|phase [0-9]/i.test(sourceText),
      referenceAccountPotential: /government|public_transit|healthcare/.test(sector),
    },
    isInbound: true,
  });

  const coverage = reqmap.length ? mapped.length / reqmap.length : 0;
  const topicalCoverage = projectType === "rfi"
    ? (reqmap.length
      ? Math.max(coverage, Math.min(1, docMatches.length / Math.max(reqmap.length, 4)))
      : (docMatches.length ? 0.55 : 0))
    : coverage;

  let rec: PursuitTriageView["rec"] = "go";
  let recRule = "";
  if (!sourceText.trim()) {
    rec = "pending";
    recRule = "No extractable document text.";
  } else if (projectType === "rfi") {
    if (topicalCoverage >= thresholds.goCoverage && alignment.total >= thresholds.goScore) {
      rec = "go";
      recRule = `RFI Respond: topical coverage ≥ ${Math.round(thresholds.goCoverage * 100)}% and score ≥ ${thresholds.goScore}.`;
    } else if (topicalCoverage >= thresholds.condCoverage || alignment.total >= thresholds.condScore) {
      rec = "cond";
      recRule = `RFI Respond with caveats: some topical fit (coverage ≥ ${Math.round(thresholds.condCoverage * 100)}% or score ≥ ${thresholds.condScore}).`;
    } else {
      rec = "nogo";
      recRule = "RFI Pass: topical fit is too thin to spend a response.";
    }
  } else if (passFailUnmapped) {
    rec = "nogo";
    recRule = "Unmapped pass/fail requirement blocks Go, regardless of score.";
  } else if (coverage >= thresholds.goCoverage && alignment.total >= thresholds.goScore) {
    rec = "go";
    recRule = `Go requires ≥ ${Math.round(thresholds.goCoverage * 100)}% requirement coverage and score ≥ ${thresholds.goScore}.`;
  } else if (coverage >= thresholds.condCoverage && alignment.total >= thresholds.condScore) {
    rec = "cond";
    recRule = `Go with conditions: coverage ≥ ${Math.round(thresholds.condCoverage * 100)}% and score ≥ ${thresholds.condScore}.`;
  } else {
    rec = "nogo";
    recRule = `No-Go: coverage is ${Math.round(coverage * 100)}% (Go needs ${Math.round(thresholds.goCoverage * 100)}%) or score ${alignment.total} is below ${thresholds.goScore}.`;
  }

  const score = rec === "pending" ? 50 : alignment.total;
  const gaps = buildGaps(reqs, reqmap, projectType);
  const rfund = rfundFromText(sourceText, lane);
  const rationale = buildRationale({
    rec,
    projectType,
    coverage,
    topicalCoverage,
    mapped: mapped.length,
    total: reqmap.length,
    passFailUnmapped,
    docMatches,
    extraction,
    org,
    provider,
    overridden: resolved.overridden,
    score,
    thresholds,
  });

  const confidence = rec === "pending"
    ? 0
    : Math.round(Math.min(92, 38
      + mapped.length * 8
      + (provider === "heuristic" ? 0 : 12)
      + coverage * 20
      + (projectType === "rfi" ? Math.min(12, docMatches.length * 3) : 0)));

  return {
    score,
    rec,
    confidence,
    confidenceNote: projectType === "rfi"
      ? "Confidence is how complete the extraction and topic mapping are — not the opportunity score. Information requests we have not answered yet do not count as delivered capability."
      : "Confidence is extraction and requirement-mapping certainty, not the opportunity score. A high score with thin mapping stays near 50%.",
    projectType,
    scoreBreakdown: {
      projectType,
      capabilityAlignment: alignment.capabilityAlignment,
      intentTiming: alignment.intentTiming,
      accountValueFit: alignment.accountValueFit,
      inboundIntentUplift: alignment.inboundIntentUplift ?? 0,
      coveragePct: Math.round(coverage * 100),
      mappedCount: mapped.length,
      totalRequirements: reqmap.length,
      documentOverlapCount: docMatches.length,
      goScoreFloor: thresholds.goScore,
      goCoverageFloor: Math.round(thresholds.goCoverage * 100),
      condScoreFloor: thresholds.condScore,
      condCoverageFloor: Math.round(thresholds.condCoverage * 100),
      passFailBlocked: passFailUnmapped,
      recRule,
      detectedFromDocument: resolved.detectedFromDocument,
      typeOverridden: resolved.overridden,
    },
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
      : projectType === "rfi"
        ? "RFI recommendation generated (Respond / Pass), awaiting human confirmation"
        : "Recommendation generated from uploaded solicitation, awaiting human confirmation",
    modelVersion,
    provider,
  };
}

function intentSignalsFor(projectType: ProjectType, sourceText: string): IntentSignal[] {
  const primary: IntentSignal = projectType === "rfi"
    ? { type: "rfi_released", confidence: 0.8, recency: 0 }
    : projectType === "sow"
      ? { type: "sow_received", confidence: 0.9, recency: 0 }
      : { type: "rfp_released", confidence: 0.95, recency: 0 };
  const budget = /(budget|funded|appropriat|board[- ]approved)/i.test(sourceText)
    ? [{ type: "budget_confirmed" as const, confidence: 0.7, recency: 30 }]
    : [];
  return [primary, ...budget];
}

function normalizeRequirements(
  reqs: SolicitationRequirement[],
  projectType: ProjectType,
): SolicitationRequirement[] {
  if (projectType !== "rfi") return reqs;
  return reqs.map(req => ({
    ...req,
    passFail: req.passFail && RFI_ELIGIBILITY.test(req.requirementText)
      ? true
      : RFI_ELIGIBILITY.test(req.requirementText),
  }));
}

function mapRequirement(
  req: SolicitationRequirement,
  docMatches: CapabilityMatch[],
  projectType: ProjectType,
) {
  const matches = matchBillityCapabilities(req.requirementText, "requirement", "public_web");
  const hit = matches[0] ?? docMatches.find(m => requestOverlapsCapability(req.requirementText, m));
  if (hit) {
    return {
      req: req.requirementText,
      status: "mapped" as const,
      node: hit.label,
      evidence: projectType === "rfi"
        ? "Topic we can speak to. This is an information request — not a completed response."
        : hit.evidence || "Matched DataBillity capability taxonomy",
    };
  }
  return {
    req: req.requirementText,
    status: "unmapped" as const,
    node: null,
    evidence: projectType === "rfi"
      ? INFO_REQUEST.test(req.requirementText)
        ? "Information request — we have not drafted an answer yet, and no matching capability topic was found."
        : "No matching capability topic at the requested specificity."
      : req.passFail
        ? "Pass/fail criterion — no matching DataBillity capability node"
        : "No matching capability node at required specificity",
  };
}

function requestOverlapsCapability(requirementText: string, match: CapabilityMatch): boolean {
  const req = requirementText.toLowerCase();
  const label = match.label.toLowerCase();
  const token = label.split(/[/,]/)[0]?.trim().slice(0, 12);
  if (token && token.length >= 4 && req.includes(token)) return true;
  if (match.evidence && req.includes(match.evidence.toLowerCase().slice(0, 16))) return true;
  return false;
}

function buildGaps(
  reqs: SolicitationRequirement[],
  reqmap: PursuitTriageView["reqmap"],
  projectType: ProjectType,
): PursuitTriageView["gaps"] {
  const gaps: PursuitTriageView["gaps"] = [];
  reqmap.forEach((row, i) => {
    if (row.status !== "unmapped") return;
    const req = reqs[i];
    const passFail = projectType === "rfi"
      ? RFI_ELIGIBILITY.test(row.req)
      : Boolean(req?.passFail || PASS_FAIL.test(row.req));
    gaps.push({
      id: `GAP-${120 + gaps.length}`,
      title: row.req,
      crit: projectType === "rfi"
        ? (passFail ? "Eligibility gate" : "Unanswered information request")
        : passFail ? "Pass/fail criterion" : "Unmapped requirement",
      demand: projectType === "rfi" ? "From uploaded RFI" : "From uploaded solicitation",
      closure: projectType === "rfi"
        ? "Draft an information response or decline this topic"
        : passFail ? "Partner coverage or No-Go" : "Partner, hire, or scoped exception",
    });
  });
  return gaps;
}

function buildRationale(input: {
  rec: PursuitTriageView["rec"];
  projectType: ProjectType;
  coverage: number;
  topicalCoverage: number;
  mapped: number;
  total: number;
  passFailUnmapped: boolean;
  docMatches: CapabilityMatch[];
  extraction: SolicitationExtraction;
  org: OrgTriageContext;
  provider: string;
  overridden: boolean;
  score: number;
  thresholds: ReturnType<typeof thresholdsFor>;
}): string[] {
  const lines: string[] = [];
  if (input.rec === "pending") {
    return ["Uploaded file did not yield extractable text. Re-upload a text PDF, Word, or plain-text solicitation."];
  }
  if (input.overridden) {
    lines.push("Document reads as an RFI (request for information), not a bid RFP. Scored on topical fit — whether we can answer — not whether a proposal already provides the information.");
  }
  if (input.projectType === "rfi") {
    lines.push(`RFI lens: ${input.mapped} of ${input.total} information requests mapped to capability topics (${Math.round(input.coverage * 100)}% request coverage). Unanswered questions are expected — this is not a bid.`);
  } else if (input.total) {
    lines.push(`${input.mapped} of ${input.total} extracted requirements mapped to DataBillity capabilities (${Math.round(input.coverage * 100)}% coverage).`);
  }
  if (input.passFailUnmapped) {
    lines.push("At least one unmapped requirement is pass/fail — sufficient to recommend No-Go until partner coverage is confirmed.");
  }
  if (input.docMatches.length) {
    lines.push(`Document language overlap: ${input.docMatches.slice(0, 3).map(m => m.label).join("; ")}. Overlap lifts the alignment score; it does not by itself satisfy bid coverage.`);
  }
  if (input.projectType !== "rfi" && input.total && input.coverage < input.thresholds.goCoverage) {
    lines.push(`Score ${input.score}/100 is opportunity alignment (capability 40 / intent 35 / account 25), not a Go cutoff. ${recDecisionLabel("go")} still needs ≥ ${Math.round(input.thresholds.goCoverage * 100)}% requirement coverage and score ≥ ${input.thresholds.goScore}.`);
  }
  if (input.extraction.dueDate) {
    lines.push(`Response due ${input.extraction.dueDate}.`);
  }
  if (input.org.industry) {
    lines.push(`Account industry: ${input.org.industry}.`);
  }
  if (input.projectType === "rfi") {
    if (input.rec === "go") {
      lines.push("Enough topical overlap to spend an information response and position for a later RFP.");
    } else if (input.rec === "cond") {
      lines.push("Respond only on the topics we can speak to; do not treat this as a full bid.");
    } else {
      lines.push("Too little topical fit to invest in an RFI response.");
    }
  } else if (input.rec === "go") {
    lines.push("Scope is close enough to platform/consulting motion to proceed, pending human confirmation.");
  } else if (input.rec === "cond") {
    lines.push("Pursue only with conditions: close capability gaps or narrow scope before a full response.");
  } else {
    lines.push("Fit is too thin against the current capability graph for a full bid.");
  }
  if (input.provider === "heuristic") {
    lines.push("Extraction used the heuristic parser (no model key). Re-run with Gemini/Claude for a denser requirement shred.");
  }
  return lines;
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
  return fromLists.map(requirementText => ({
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

function extractTitle(text: string, projectType: ProjectType): string {
  const generic = /^(request for (?:proposals?|information)|statement of work|solicitation|rfp|rfi|sow|purpose|objective|overview|scope of work)$/i;
  const fromPurpose = sectionBullets(text, /purpose|objective/i)[0];
  if (fromPurpose && fromPurpose.length <= 110) {
    return fromPurpose.replace(/[.]+$/, "");
  }
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean).slice(0, 16);
  const named = lines.find(l =>
    /request for (?:proposal|information)|statement of work|solicitation/i.test(l)
    && l.length < 140
    && !generic.test(l),
  );
  if (named) {
    return named.replace(/^(request for (?:proposal|information)|rfp|rfi|statement of work|sow)[:\s-]*/i, "").trim() || named;
  }
  return lines.find(l =>
    l.length > 8
    && l.length < 90
    && !generic.test(l)
    && !/^(issued by|proposals? due|due date|page \d+)/i.test(l)
    && !/\b(?:RFP|RFQ|RFI|SOL)[-\s]*[A-Z0-9]/i.test(l)
  ) ?? (projectType === "rfi" ? "Untitled RFI" : "");
}

function extractSolicitationRef(text: string): string | null {
  const match = text.match(/\b(?:RFP|RFQ|RFI|SOL)[-\s]*[A-Z0-9][A-Z0-9-./]{2,}\b/i);
  return match?.[0]?.replace(/\s+/g, " ").trim() ?? null;
}

function extractDueDate(text: string): string | null {
  const match = text.match(
    /\b(?:due(?:\s+date)?|closing|submission deadline|proposals?\s+due|responses?\s+due)[:\s]+([A-Z][a-z]+ \d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/i,
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

function extractRequirements(text: string, projectType: ProjectType): SolicitationRequirement[] {
  const out: SolicitationRequirement[] = [];
  const seen = new Set<string>();
  const push = (raw: string, sectionRef?: string) => {
    const requirementText = raw.replace(/\s+/g, " ").trim();
    const key = requirementText.toLowerCase();
    if (requirementText.length < 28 || seen.has(key)) return;
    seen.add(key);
    out.push({
      requirementText,
      sectionRef,
      passFail: projectType === "rfi"
        ? RFI_ELIGIBILITY.test(requirementText)
        : PASS_FAIL.test(requirementText),
    });
  };

  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    const numbered = trimmed.match(/^(?:(?:section|sec\.?)\s*)?(\d+(?:\.\d+){0,3}|[A-Z]\.|[a-z]\))\s+(.{28,})$/);
    if (numbered && /\b(shall|must|required|provide|support|include|describe|explain)\b/i.test(numbered[2]!)) {
      push(numbered[2]!, numbered[1]);
    } else if (/^(?:the\s+)?(?:contractor|vendor|offeror|respondent)\s+shall\b/i.test(trimmed)) {
      push(trimmed);
    } else if (projectType === "rfi" && INFO_REQUEST.test(trimmed)) {
      push(trimmed);
    }
  }

  if (out.length < 4) {
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      if (projectType === "rfi") {
        if (INFO_REQUEST.test(sentence) || /\b(shall|must)\b/i.test(sentence)) push(sentence);
      } else if (/\b(shall|must)\b/i.test(sentence)) {
        push(sentence);
      }
    }
  }
  return out;
}

function extractResponseSections(text: string, projectType: ProjectType): SolicitationExtraction["responseSections"] {
  const found: SolicitationExtraction["responseSections"] = [];
  const re = /(?:volume|vol\.?|section|attachment)\s+([IVX0-9.]+)[:\s]+([A-Z][^\n]{6,})/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const title = match[2]!.replace(/[.]+$/, "").trim();
    found.push({
      ref: `${/vol/i.test(match[0]) ? "Vol" : "§"} ${match[1]}`.trim(),
      title,
      sectionId: slug(title),
    });
  }
  if (found.length) return found;
  if (projectType === "rfi") {
    return [
      { ref: "Overview", title: "Company & Capabilities", sectionId: "overview" },
      { ref: "Experience", title: "Relevant Experience", sectionId: "experience" },
      { ref: "Approach", title: "Approach to the Information Request", sectionId: "approach" },
    ];
  }
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
  const body = nextHeading >= 0 ? rest.slice(0, nextHeading) : rest;
  const items = body
    .split(/\n+/)
    .map(line => line.replace(/^[\s\-•*0-9.)]+/, "").trim())
    .filter(line => line.length > 24 && !heading.test(line));
  return items;
}

function sentencesMatching(text: string, pattern: RegExp): string[] {
  const items: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const trimmed = sentence.replace(/\s+/g, " ").trim();
    if (trimmed.length > 28 && pattern.test(trimmed)) {
      items.push(trimmed);
    }
  }
  return items;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
}
