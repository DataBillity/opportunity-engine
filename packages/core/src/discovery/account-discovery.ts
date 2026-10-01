/**
 * Lane A discovery scoring (DISC-05, DISC-06, DISC-11, SCORE-01, SCORE-07, SCORE-08, INB-02).
 * Pure functions. Public-source I/O stays in the web app.
 */
import { normalizeLegalName } from "../entity-resolution";
import {
  commercialMotionOf,
  inferIcpVertical,
  matchBillityCapabilities,
  type CapabilityMatch,
} from "../scoring/billity-icp";
import {
  computeOpportunityAlignment,
  type IntentSignal,
} from "../scoring/opportunity-alignment";

export const DISCOVERY_MODEL_VERSION = "opportunity-alignment-v1";
export const DISCOVERY_PROMPT_VERSION = "disc-score-v1.0";
export const FIELD_FRESHNESS_DAYS = 45;

export interface GraphNodeRef {
  id: string;
  name: string;
  kind: "capability" | "experience";
}

export interface DiscoveryField {
  field: string;
  value: string;
  source: string;
  sourceRef: string;
  capturedAt: string;
}

export interface DiscoveryAssessment {
  total: number;
  capabilityAlignment: number;
  intentTiming: number;
  accountValueFit: number;
  inboundIntentUplift: number;
  modelVersion: string;
  promptVersion: string;
  graphVersion: string;
  runAt: string;
  factors: string[];
  whyGoodFit: string;
  industry: string;
  sector: string;
  channelLens: "direct" | "channel";
  matchedNodes: GraphNodeRef[];
  capabilityLabels: string[];
}

export interface DiscoveryScoreInput {
  name: string;
  domain?: string;
  text: string;
  industryHint?: string;
  isInbound: boolean;
  priorRelationship: boolean;
  graph: GraphNodeRef[];
  graphVersion: string;
  capturedAt?: string;
  sourceType?: CapabilityMatch["sourceType"];
}

const CHANNEL_RE = /\b(reseller|channel partner|value-added reseller|\bvar\b|systems integrator|referral partner|agency of record)\b/i;

const INTENT_DETECTORS: { type: IntentSignal["type"]; pattern: RegExp; label: string }[] = [
  { type: "rfp_released", pattern: /\brfp\b|request for proposal|solicitation/, label: "a solicitation or RFP" },
  { type: "rfi_released", pattern: /\brfi\b|request for information/, label: "an RFI or information request" },
  { type: "sow_received", pattern: /\bsow\b|statement of work/, label: "a statement of work" },
  { type: "budget_confirmed", pattern: /\b(budget|appropriation|funding round|series [a-d])\b|\$\s?\d/, label: "budget or funding language" },
  { type: "leadership_change", pattern: /appointed|named .{0,40}\b(chief|cto|cio|cdo|ceo)\b|new (cto|cio|cdo|ceo)/, label: "a leadership change" },
  { type: "job_posting", pattern: /\bhiring\b|job posting|open roles?|we're hiring/, label: "hiring activity" },
  { type: "public_statement", pattern: /moderniz|legacy (system|infrastructure|platform)|strategic (priority|initiative)|digital transformation/, label: "a public modernization or strategy statement" },
];

const TOKEN_STOP = new Set([
  "systems", "system", "services", "service", "platform", "public", "data",
  "management", "integration", "digital", "solutions", "group", "partners",
]);

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "yopmail.com",
  "trashmail.com",
  "dispostable.com",
  "sharklasers.com",
  "getnada.com",
]);

export function graphVersionOf(nodes: { id: string }[]): string {
  const src = nodes.map((node) => node.id).sort().join("|");
  let hash = 5381;
  for (let i = 0; i < src.length; i++) {
    hash = ((hash << 5) + hash) ^ src.charCodeAt(i);
  }
  return `graph-${(hash >>> 0).toString(16)}`;
}

export function normalizeDomain(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0] ?? "";
}

export function isStaleCapture(capturedAt: string, now = Date.now()): boolean {
  const parsed = Date.parse(capturedAt);
  if (Number.isNaN(parsed)) return true;
  return now - parsed > FIELD_FRESHNESS_DAYS * 24 * 60 * 60 * 1000;
}

export function scoreDiscoveredAccount(input: DiscoveryScoreInput): DiscoveryAssessment {
  const runAt = input.capturedAt ?? new Date().toISOString();
  const corpus = [input.name, input.domain, input.industryHint, input.text].filter(Boolean).join("\n");
  const vertical = inferIcpVertical(`${input.industryHint ?? ""}\n${input.name}\n${input.text}`);
  const industry = input.industryHint?.trim() || vertical?.industry || "Unclassified";
  const sector = vertical?.sector ?? "unknown";
  const billity = matchBillityCapabilities(
    corpus,
    input.domain || input.name,
    input.sourceType ?? "public_web",
  );
  const matchedNodes = matchGraphNodes(corpus, input.graph);
  const signals = detectIntentSignals(corpus);
  const capabilityMatchCount = Math.min(
    billity.length + matchedNodes.length + (vertical ? 1 : 0),
    6,
  );

  const scoreOut = computeOpportunityAlignment({
    capabilityMatchCount,
    totalCapabilitiesRequired: 3,
    matchMaturity: matchedNodes.length ? 0.75 : billity.length ? 0.6 : 0.35,
    intentSignals: signals,
    accountValue: {
      sector,
      sizeBand: "unknown",
      priorRelationship: input.priorRelationship,
      multiYearPotential: /multi-year|annual contract|retainer/.test(corpus.toLowerCase()) || Boolean(vertical),
      referenceAccountPotential: /\b(enterprise|publicly traded|fortune)\b/.test(corpus.toLowerCase()),
    },
    isInbound: input.isInbound,
  });

  const channelLens: "direct" | "channel" =
    CHANNEL_RE.test(corpus) && commercialMotionOf(billity) !== "platform" ? "channel" : "direct";

  let total = scoreOut.total;
  if (!input.text.trim() && !vertical && matchedNodes.length === 0 && billity.length === 0) {
    total = Math.min(total, 42);
  }

  const factors = buildFactors({
    industry,
    vertical: Boolean(vertical),
    billity,
    matchedNodes,
    signals,
    inboundUplift: scoreOut.inboundIntentUplift ?? 0,
    channelLens,
    thin: !input.text.trim(),
  });

  return {
    total,
    capabilityAlignment: scoreOut.capabilityAlignment,
    intentTiming: scoreOut.intentTiming,
    accountValueFit: scoreOut.accountValueFit,
    inboundIntentUplift: scoreOut.inboundIntentUplift ?? 0,
    modelVersion: DISCOVERY_MODEL_VERSION,
    promptVersion: DISCOVERY_PROMPT_VERSION,
    graphVersion: input.graphVersion,
    runAt,
    factors,
    whyGoodFit: factors[0] ?? "Scored from the text on record. No stronger public signal was available.",
    industry,
    sector,
    channelLens,
    matchedNodes,
    capabilityLabels: billity.map((match) => match.label),
  };
}

export function screenInboundLead(input: {
  name: string;
  email?: string;
  summary?: string;
}): { flags: string[] } {
  const flags: string[] = [];
  if (!input.name.trim()) flags.push("Company name is missing.");
  const email = input.email?.trim() ?? "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    flags.push("Contact email is not a valid address. Review it before outreach.");
  }
  const domain = email.split("@")[1]?.toLowerCase();
  if (domain && DISPOSABLE_DOMAINS.has(domain)) {
    flags.push("Contact email uses a disposable domain. Confirm this is a real inquiry before outreach.");
  }
  if ((input.summary?.trim().length ?? 0) < 12) {
    flags.push("The inquiry is thin. A person should review it before it is declined or sequenced.");
  }
  return { flags };
}

export function matchExistingAccount(
  candidate: { name: string; domain?: string },
  accounts: { id: string; name: string; domain?: string }[],
): { id: string; name: string; reason: string } | null {
  const domain = normalizeDomain(candidate.domain);
  const name = normalizeLegalName(candidate.name);
  for (const account of accounts) {
    const accountDomain = normalizeDomain(account.domain);
    if (domain && accountDomain && domain === accountDomain) {
      return { id: account.id, name: account.name, reason: "Same domain already in the pipeline" };
    }
    const accountName = normalizeLegalName(account.name);
    if (!name || !accountName || Math.min(name.length, accountName.length) < 4) continue;
    if (name === accountName || name.includes(accountName) || accountName.includes(name)) {
      return { id: account.id, name: account.name, reason: "Same organization name already in the pipeline" };
    }
  }
  return null;
}

export function nextHotLeadId(input: {
  previousTopId: string | null;
  previousTopScore: number;
  ranked: { id: string; score: number; eligible: boolean }[];
}): string | null {
  const top = input.ranked
    .filter((row) => row.eligible)
    .sort((a, b) => b.score - a.score)[0];
  if (!top || !input.previousTopId) return null;
  if (top.id !== input.previousTopId && top.score > input.previousTopScore) return top.id;
  return null;
}

function matchGraphNodes(text: string, graph: GraphNodeRef[]): GraphNodeRef[] {
  const haystack = text.toLowerCase();
  const hits: GraphNodeRef[] = [];
  for (const node of graph) {
    if (node.kind !== "capability" && node.kind !== "experience") continue;
    const name = node.name.toLowerCase().trim();
    if (name.length >= 10 && haystack.includes(name)) {
      hits.push(node);
      continue;
    }
    const tokens = name.split(/[^a-z0-9]+/).filter((token) => token.length >= 5 && !TOKEN_STOP.has(token));
    if (!tokens.length) continue;
    const needed = Math.min(2, tokens.length);
    const found = tokens.filter((token) => haystack.includes(token)).length;
    if (found >= needed) hits.push(node);
  }
  return hits.slice(0, 6);
}

function detectIntentSignals(text: string): IntentSignal[] {
  const signals: IntentSignal[] = [];
  for (const detector of INTENT_DETECTORS) {
    if (!detector.pattern.test(text)) continue;
    signals.push({ type: detector.type, confidence: 0.72, recency: 0 });
  }
  return signals;
}

function buildFactors(input: {
  industry: string;
  vertical: boolean;
  billity: CapabilityMatch[];
  matchedNodes: GraphNodeRef[];
  signals: IntentSignal[];
  inboundUplift: number;
  channelLens: "direct" | "channel";
  thin: boolean;
}): string[] {
  const factors: string[] = [];
  if (input.matchedNodes.length) {
    const names = input.matchedNodes.slice(0, 2).map((node) => node.name).join(" and ");
    factors.push(`Public text lines up with consortium graph nodes, including ${names}.`);
  } else if (input.billity.length) {
    factors.push(`Capability alignment uses ${input.billity[0]!.label}.`);
  } else {
    factors.push("No consortium capability in the current graph was evidenced in the public text.");
  }

  if (input.signals.length) {
    const labels = INTENT_DETECTORS
      .filter((detector) => input.signals.some((signal) => signal.type === detector.type))
      .map((detector) => detector.label);
    factors.push(`Timing evidence in the sourced text: ${labels.join("; ")}.`);
  } else {
    factors.push("No dated trigger (funding, hiring, solicitation, or leadership change) was present in the sourced text.");
  }

  factors.push(
    input.vertical
      ? `Industry reads as ${input.industry}, which is inside the current ICP.`
      : `Industry reads as ${input.industry}, which is outside the current ICP verticals.`,
  );

  if (input.inboundUplift > 0) {
    factors.push(`Inbound intent added ${input.inboundUplift} points to timing. Channel does not use a separate score.`);
  }
  if (input.channelLens === "channel") {
    factors.push("The text reads primarily as a reseller or channel relationship. Review it as a partner candidate before a direct outreach sequence.");
  }
  if (input.thin) {
    factors.push("Enrichment text was empty, so the score uses only the name and industry on the record.");
  }
  return factors;
}
