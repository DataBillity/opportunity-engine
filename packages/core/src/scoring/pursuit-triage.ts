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
const INFO_REQUEST = /\b(provide information|please (?:describe|provide|explain|identify|outline)|how would you|what (?:is|are) your|describe your|describe the|describe if|do you have|how will|how does|is data |does the solution)\b/i;
const RESPONSE_FORMAT = /\b(\d+\s*pages?|page limit|single[- ]spaced|point font|one-inch margins|font size|submission format|file format|margins)\b/i;

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
    challenges: pickList(overlay.challenges, base.challenges),
    services: pickList(overlay.services, base.services),
    deliverables: pickList(overlay.deliverables, base.deliverables),
    requirements: overlayReqs.length ? overlayReqs : base.requirements,
    responseSections: overlay.responseSections?.length ? overlay.responseSections : base.responseSections,
    responseConstraints: pickList(overlay.responseConstraints, base.responseConstraints),
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
  const scope = extractScopeNarrative(text, projectType);
  return {
    inferredName: extractTitle(text, projectType) || stem || "Untitled solicitation",
    solicitationRef,
    dueDate: due,
    issuer: extractIssuer(text),
    objective: scope.objective,
    challenges: scope.challenges,
    services: scope.services,
    deliverables: scope.deliverables,
    requirements,
    responseSections: extractResponseSections(text, projectType),
    responseConstraints: extractResponseConstraints(text),
    constraints: sentencesMatching(text, /fedramp|hipaa|soc 2|iso 27001|bonding|ato\b|wcag|zero[- ]downtime/i)
      .filter(line => !RESPONSE_FORMAT.test(line)),
  };
}

export interface CapabilityCatalogEntry {
  name: string;
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
  capabilityCatalog?: CapabilityCatalogEntry[];
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

  const scopeCorpus = scopeTextForScoring(extraction, sourceText, projectType);
  const reqs = projectType === "rfi"
    ? scopeRequirements(extraction, scopeCorpus)
    : normalizeRequirements(
      extraction.requirements.length ? extraction.requirements : fallbackRequirements(extraction),
      projectType,
    );
  const docMatches = matchBillityCapabilities(scopeCorpus || sourceText, "solicitation", "public_web");
  const catalog = input.capabilityCatalog ?? [];
  const reqmap = reqs.map(req => mapRequirement(req, docMatches, projectType, catalog));
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
  const topicalCoverage = coverage;

  let rec: PursuitTriageView["rec"] = "go";
  let recRule = "";
  if (!sourceText.trim()) {
    rec = "pending";
    recRule = "No extractable document text.";
  } else if (projectType === "rfi") {
    if (topicalCoverage >= thresholds.goCoverage && alignment.total >= thresholds.goScore) {
      rec = "go";
      recRule = `RFI Respond: topical coverage ≥ ${Math.round(thresholds.goCoverage * 100)}% and score ≥ ${thresholds.goScore}.`;
    } else if (topicalCoverage >= thresholds.condCoverage && alignment.total >= thresholds.condScore) {
      rec = "cond";
      recRule = `RFI Respond with caveats: scope coverage ≥ ${Math.round(thresholds.condCoverage * 100)}% and score ≥ ${thresholds.condScore}. Page limits are not part of this rule.`;
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
      ? "Confidence is how complete the scope extraction and capability mapping are — not the opportunity score. Page limits and response questions are not scored."
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
  catalog: CapabilityCatalogEntry[] = [],
) {
  const catalogHit = matchCatalog(req.requirementText, catalog);
  const matches = matchBillityCapabilities(req.requirementText, "requirement", "public_web");
  const hit = matches[0] ?? catalogHit ?? docMatches.find(m => requestOverlapsCapability(req.requirementText, m));
  if (hit) {
    return {
      req: req.requirementText,
      status: "mapped" as const,
      node: hit.label,
      evidence: projectType === "rfi"
        ? `Scope topic matches ${hit.label}. Page limits and response questions are not part of this score.`
        : hit.evidence || "Matched DataBillity capability taxonomy",
    };
  }
  return {
    req: req.requirementText,
    status: "unmapped" as const,
    node: null,
    evidence: projectType === "rfi"
      ? "Scope topic has no matching capability or expertise."
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
        ? (passFail ? "Eligibility gate" : "Scope outside current capabilities")
        : passFail ? "Pass/fail criterion" : "Unmapped requirement",
      demand: projectType === "rfi" ? "From RFI purpose and challenges" : "From uploaded solicitation",
      closure: projectType === "rfi"
        ? "Partner coverage or Pass"
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
    lines.push("Document reads as an RFI. Scored on the purpose, challenges, and likely services — not on page limits or the questions in the response worksheet.");
  }
  if (input.projectType === "rfi") {
    lines.push(`RFI lens: ${input.mapped} of ${input.total} scope topics mapped to capabilities (${Math.round(input.coverage * 100)}% scope coverage). Response format and unanswered questions do not change Respond/Pass.`);
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
      lines.push("Some of the stated scope fits our capabilities. Respond only where that fit is real; page limits do not change the decision.");
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

const FORMAT_STOP = new Set(["pages", "page", "limit", "font", "margin", "margins", "single", "spaced", "point"]);

function isScopeStatement(text: string): boolean {
  const value = text.trim();
  if (value.length < 28) return false;
  if (RESPONSE_FORMAT.test(value) && !/\b(moderniz|claims|workflow|system|platform)\b/i.test(value)) return false;
  if (INFO_REQUEST.test(value)) return false;
  return true;
}

function extractResponseConstraints(text: string): string[] {
  return sentencesMatching(text, RESPONSE_FORMAT).slice(0, 6);
}

function extractScopeNarrative(text: string, projectType: ProjectType): {
  objective: string[];
  challenges: string[];
  services: string[];
  deliverables: string[];
} {
  if (projectType !== "rfi") {
    const objective = sectionBullets(text, /(?:purpose|objective|overview|background)\b/i).filter(isScopeStatement).slice(0, 6);
    const services = sectionBullets(text, /(?:scope of (?:work|services)|services required|statement of work)\b/i).filter(isScopeStatement).slice(0, 8);
    const deliverables = sectionBullets(text, /deliverables?\b/i).filter(line => !RESPONSE_FORMAT.test(line)).slice(0, 8);
    return {
      objective: objective.length ? objective : sentencesMatching(text, /moderniz|replace|implement|retire|redesign|deploy/i).filter(isScopeStatement).slice(0, 6),
      challenges: [],
      services: services.length ? services : sentencesMatching(text, /integrat|platform|pipeline|analytics|payment|portal|migrat/i).filter(isScopeStatement).slice(0, 8),
      deliverables: deliverables.length ? deliverables : sentencesMatching(text, /deliver|production|dashboard|training|cutover|rollout/i).filter(line => !RESPONSE_FORMAT.test(line)).slice(0, 8),
    };
  }

  const purpose = sectionBody(text, /project purpose|purpose of this rfi/i);
  const challenges = sectionBody(text, /current challenges|challenge statement/i);
  const vision = sectionBody(text, /project vision/i);
  const background = sectionBody(text, /project background/i);
  const intro = sectionBody(text, /introduction and overview/i);

  const objective = uniqueLines([
    ...sentencesMatching(purpose, /seeking|objective|intent|moderniz|replace|market research|configurable/i),
    ...sentencesMatching(intro, /issuing this|solicit|moderniz|replace/i),
  ]).filter(isScopeStatement).slice(0, 4);

  const challengeLines = collapseContained(uniqueLines([
    ...numberedItems(challenges),
    ...sentencesMatching(challenges, /lack of|limitation|manual|cannot|unable|challenge/i),
  ]).filter(isScopeStatement)).slice(0, 8);

  const serviceLines = collapseContained(uniqueLines([
    ...sentencesMatching(`${vision}\n${purpose}`, /system|workflow|automat|integrat|configur|platform|solution|claims|payment|migrat/i),
  ]).filter(isScopeStatement).filter(line => !objective.some(item => item.toLowerCase() === line.toLowerCase()))).slice(0, 6);

  const deliverableLines = uniqueLines([
    ...sentencesMatching(`${vision}\n${background}`, /system|module|workflow|application|engine|portal|migration/i),
  ]).filter(isScopeStatement).slice(0, 6);

  return {
    objective: objective.length ? objective : sentencesMatching(text, /seeking information|moderniz|replace the current/i).filter(isScopeStatement).slice(0, 3),
    challenges: challengeLines,
    services: serviceLines,
    deliverables: deliverableLines,
  };
}

function scopeTextForScoring(extraction: SolicitationExtraction, sourceText: string, projectType: ProjectType): string {
  const listed = [
    ...extraction.objective,
    ...(extraction.challenges ?? []),
    ...extraction.services,
    ...extraction.deliverables,
  ].filter(isScopeStatement);
  if (projectType === "rfi") {
    const narrative = extractScopeNarrative(sourceText, "rfi");
    const fromDoc = [...narrative.objective, ...narrative.challenges, ...narrative.services, ...narrative.deliverables];
    if (fromDoc.length) return uniqueLines([...listed, ...fromDoc]).join("\n");
  }
  if (listed.length) return listed.join("\n");
  return sourceText
    .split(/\n+/)
    .filter(line => !RESPONSE_FORMAT.test(line) && !INFO_REQUEST.test(line))
    .join("\n");
}

function scopeRequirements(extraction: SolicitationExtraction, scopeCorpus: string): SolicitationRequirement[] {
  const listed = uniqueLines([
    ...extraction.objective,
    ...(extraction.challenges ?? []),
    ...extraction.services,
    ...extraction.deliverables,
  ]).filter(isScopeStatement);
  const items = listed.length ? listed : uniqueLines(scopeCorpus.split(/\n+/)).filter(isScopeStatement).slice(0, 12);
  return items.map(requirementText => ({ requirementText, passFail: false }));
}

function matchCatalog(
  text: string,
  catalog: CapabilityCatalogEntry[],
): { label: string; evidence: string } | undefined {
  const hay = text.toLowerCase();
  let best: { label: string; evidence: string; score: number } | undefined;
  for (const entry of catalog) {
    const tokens = entry.name.toLowerCase().split(/[^a-z0-9]+/).filter(token =>
      token.length >= 5 && !FORMAT_STOP.has(token),
    );
    const hits = tokens.filter(token => hay.includes(token));
    const score = hits.length >= 2 || hits.some(token => token.length >= 10) ? hits.length : 0;
    if (score && (!best || score > best.score)) {
      best = { label: entry.name, evidence: entry.name, score };
    }
  }
  return best ? { label: best.label, evidence: best.evidence } : undefined;
}

function sectionBody(text: string, heading: RegExp): string {
  const match = heading.exec(text);
  if (!match || match.index === undefined) return "";
  const rest = text.slice(match.index + match[0].length);
  const next = rest.search(/\n\s*[A-Z]\.\s+[A-Z]/);
  return (next >= 0 ? rest.slice(0, next) : rest).slice(0, 4000);
}

function numberedItems(text: string): string[] {
  return text
    .split(/(?:^|\n)\s*\d+\.\s+/)
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(line => line.length > 28);
}

function collapseContained(lines: string[]): string[] {
  return lines.filter((line, index) => !lines.some((other, otherIndex) =>
    otherIndex !== index && other.length > line.length && other.toLowerCase().includes(line.toLowerCase()),
  ));
}

function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const value = line.replace(/\s+/g, " ").trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
}
