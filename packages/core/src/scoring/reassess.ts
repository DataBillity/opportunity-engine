/**
 * Re-score an existing Go/No-Go packet against the partners currently on the team.
 * PURE — no I/O. Uses the same coverage gates and weights as the initial triage, so a
 * reassessment never disagrees with what a fresh upload would conclude from the same mapping.
 */
import type { ProjectType } from "@opportunity-engine/contracts";
import { computeCapabilityAlignment } from "./opportunity-alignment";
import { isPassFailRequirement, matchCatalog, recommendFromCoverage } from "./pursuit-triage";

export const PARTNER_COVERAGE_NODE = "Partner coverage: ";

export type TriageRec = "go" | "nogo" | "cond" | "pending";

export interface ReassessRequirement {
  req: string;
  status: "mapped" | "unmapped";
  node: string | null;
  evidence: string;
  gapId?: string;
}

export interface ReassessGap {
  id: string;
  title: string;
  crit: string;
  demand: string;
  closure: string;
}

export interface ReassessCapability {
  id: string;
  name: string;
  partnerIds: string[];
}

export interface ReassessPartner {
  id: string;
  name: string;
  covers: string[];
}

export interface ReassessBreakdown {
  intentTiming: number;
  accountValueFit: number;
  inboundIntentUplift: number;
  documentOverlapCount: number;
}

export interface ReassessInput {
  projectType: ProjectType;
  reqmap: ReassessRequirement[];
  gaps: ReassessGap[];
  capabilities: ReassessCapability[];
  /** Partners on this opportunity. Capabilities held only by other partners do not count. */
  partners: ReassessPartner[];
  /** Names for every partner id, including those not on the team, for explaining lost coverage. */
  partnerNames?: Record<string, string>;
  score: number;
  confidence: number;
  rec: TriageRec;
  breakdown?: ReassessBreakdown;
}

export interface RequirementChange {
  req: string;
  from: "mapped" | "unmapped";
  to: "mapped" | "unmapped";
  node: string | null;
  /** Partner names whose capability or coverage explains the change. */
  partners: string[];
}

export interface ReassessResult {
  assessable: boolean;
  reqmap: ReassessRequirement[];
  gaps: ReassessGap[];
  score: number;
  rec: TriageRec;
  recRule: string;
  confidence: number;
  capabilityAlignment: number;
  coveragePct: number;
  mappedCount: number;
  totalRequirements: number;
  passFailBlocked: boolean;
  changes: RequirementChange[];
}

const TOKEN_STOP = new Set(["with", "from", "that", "this", "their", "production", "prior", "reference", "required"]);

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length >= 4 && !TOKEN_STOP.has(token));
}

/** The gap logged for a requirement: by id, exact title, or most of the gap title's words. */
export function gapForRequirement<T extends { id: string; title: string }>(
  row: { req: string; gapId?: string },
  gaps: T[],
): T | undefined {
  if (row.gapId) {
    const byId = gaps.find(gap => gap.id === row.gapId);
    if (byId) return byId;
  }
  const req = row.req.trim().toLowerCase();
  const exact = gaps.find(gap => gap.title.trim().toLowerCase() === req);
  if (exact) return exact;
  const reqTokens = new Set(tokens(row.req));
  let best: { gap: T; ratio: number } | undefined;
  for (const gap of gaps) {
    const titleTokens = tokens(gap.title);
    if (!titleTokens.length) continue;
    const ratio = titleTokens.filter(token => reqTokens.has(token)).length / titleTokens.length;
    if (ratio >= 0.6 && (!best || ratio > best.ratio)) best = { gap, ratio };
  }
  return best?.gap;
}

function capabilityForNode(node: string, capabilities: ReassessCapability[]): ReassessCapability | undefined {
  return capabilities.find(cap => node === cap.name || node === cap.id || node.startsWith(`${cap.id} `));
}

function capabilityScore(projectType: ProjectType, mapped: number, total: number, overlap: number): number {
  const required = Math.max(total, 1);
  const matchCount = projectType === "rfi" ? (mapped || Math.min(overlap, required)) : mapped;
  const maturity = mapped ? 0.75 : projectType === "rfi" && overlap ? 0.5 : 0.15;
  return computeCapabilityAlignment({ capabilityMatchCount: matchCount, totalCapabilitiesRequired: required, matchMaturity: maturity });
}

function nextGapNumber(gaps: { id: string }[], rows: { gapId?: string }[]): number {
  const ids = [...gaps.map(gap => gap.id), ...rows.map(row => row.gapId ?? "")];
  const nums = ids.map(id => Number(id.replace(/\D/g, ""))).filter(n => Number.isFinite(n) && n > 0);
  return Math.max(119, ...nums) + 1;
}

export function reassessPursuit(input: ReassessInput): ReassessResult {
  const { projectType } = input;
  const total = input.reqmap.length;
  const priorMapped = input.reqmap.filter(row => row.status === "mapped").length;
  const overlap = input.breakdown?.documentOverlapCount ?? 0;

  if (!total) {
    return {
      assessable: false,
      reqmap: input.reqmap,
      gaps: input.gaps,
      score: input.score,
      rec: input.rec,
      recRule: "",
      confidence: input.confidence,
      capabilityAlignment: capabilityScore(projectType, 0, 0, overlap),
      coveragePct: 0,
      mappedCount: 0,
      totalRequirements: 0,
      passFailBlocked: false,
      changes: [],
    };
  }

  const onTeam = new Map(input.partners.map(partner => [partner.id, partner]));
  const teamByName = new Map(input.partners.map(partner => [partner.name.toLowerCase(), partner]));
  const teamCapabilities = input.capabilities.filter(cap =>
    cap.partnerIds.length === 0 || cap.partnerIds.some(id => onTeam.has(id)),
  );
  const holders = (cap: ReassessCapability) => cap.partnerIds.map(id => onTeam.get(id)?.name).filter((name): name is string => Boolean(name));

  const changes: RequirementChange[] = [];
  const reqmap: ReassessRequirement[] = input.reqmap.map(row => {
    const gapId = row.gapId ?? (row.status === "unmapped" ? gapForRequirement(row, input.gaps)?.id : undefined);
    const keep = (): ReassessRequirement => ({ ...row, status: "mapped", ...(gapId ? { gapId } : {}) });

    if (row.status === "mapped" && !row.node) return keep();
    if (row.status === "mapped" && row.node) {
      if (row.node.startsWith(PARTNER_COVERAGE_NODE)) {
        if (teamByName.has(row.node.slice(PARTNER_COVERAGE_NODE.length).trim().toLowerCase())) return keep();
      } else {
        const cap = capabilityForNode(row.node, input.capabilities);
        if (!cap || cap.partnerIds.length === 0 || cap.partnerIds.some(id => onTeam.has(id))) return keep();
      }
    }

    const catalogHit = matchCatalog(row.req, teamCapabilities.map(cap => ({ name: cap.name })));
    const cap = catalogHit ? teamCapabilities.find(item => item.name === catalogHit.label) : undefined;
    let next: ReassessRequirement;
    let credited: string[] = [];
    if (cap) {
      credited = holders(cap);
      next = {
        req: row.req,
        status: "mapped",
        node: `${cap.id} ${cap.name}`,
        evidence: credited.length ? `Capability held by ${credited.join(", ")}` : "Consortium-owned capability",
      };
    } else {
      const coverer = gapId ? input.partners.find(partner => partner.covers.includes(gapId)) : undefined;
      if (coverer) {
        credited = [coverer.name];
        next = {
          req: row.req,
          status: "mapped",
          node: `${PARTNER_COVERAGE_NODE}${coverer.name}`,
          evidence: `${coverer.name} covers ${gapId}`,
        };
      } else if (row.status === "unmapped") {
        next = { ...row };
      } else {
        const lost = row.node ? capabilityForNode(row.node, input.capabilities) : undefined;
        credited = lost
          ? lost.partnerIds.map(id => input.partnerNames?.[id] ?? id)
          : row.node?.startsWith(PARTNER_COVERAGE_NODE) ? [row.node.slice(PARTNER_COVERAGE_NODE.length).trim()] : [];
        next = {
          req: row.req,
          status: "unmapped",
          node: null,
          evidence: "No partner on this opportunity provides this capability",
        };
      }
    }
    if (gapId) next.gapId = gapId;
    if (next.status !== row.status) {
      changes.push({ req: row.req, from: row.status, to: next.status, node: next.status === "mapped" ? next.node : row.node, partners: credited });
    }
    return next;
  });

  let gapNumber = nextGapNumber(input.gaps, reqmap);
  const rowGapIds = new Set<string>();
  const rowGaps: ReassessGap[] = [];
  for (const row of reqmap) {
    if (row.status !== "unmapped") {
      if (row.gapId) rowGapIds.add(row.gapId);
      continue;
    }
    const existing = gapForRequirement(row, input.gaps);
    if (existing) {
      row.gapId = existing.id;
      if (!rowGapIds.has(existing.id)) rowGaps.push(existing);
      rowGapIds.add(existing.id);
      continue;
    }
    const passFail = isPassFailRequirement(row.req, projectType);
    const id = row.gapId ?? `GAP-${gapNumber++}`;
    row.gapId = id;
    rowGapIds.add(id);
    rowGaps.push({
      id,
      title: row.req,
      crit: projectType === "rfi"
        ? (passFail ? "Eligibility gate" : "Scope outside current capabilities")
        : passFail ? "Pass/fail criterion" : "Unmapped requirement",
      demand: projectType === "rfi" ? "From RFI purpose and challenges" : "From uploaded solicitation",
      closure: projectType === "rfi"
        ? "Partner coverage or Pass"
        : passFail ? "Partner coverage or No-Go" : "Partner, hire, or scoped exception",
    });
  }
  const unrelatedGaps = input.gaps.filter(gap => !rowGapIds.has(gap.id));
  const gaps = [...rowGaps, ...unrelatedGaps];

  const mapped = reqmap.filter(row => row.status === "mapped").length;
  const coverage = mapped / total;
  const passFailBlocked = projectType !== "rfi" && reqmap.some(row => {
    if (row.status !== "unmapped") return false;
    const gap = gapForRequirement(row, gaps);
    return /pass\s*\/?\s*fail/i.test(gap?.crit ?? "") || isPassFailRequirement(row.req, projectType);
  });

  const priorCap = capabilityScore(projectType, priorMapped, total, overlap);
  const capabilityAlignment = capabilityScore(projectType, mapped, total, overlap);
  const score = input.breakdown
    ? Math.round(Math.min(100,
      (capabilityAlignment * 40 + input.breakdown.intentTiming * 35 + input.breakdown.accountValueFit * 25) / 100
      + input.breakdown.inboundIntentUplift))
    : Math.round(Math.max(0, Math.min(100, input.score + (capabilityAlignment - priorCap) * 0.4)));

  const { rec, recRule } = recommendFromCoverage({ projectType, coverage, score, passFailUnmapped: passFailBlocked });
  const priorCoverage = priorMapped / total;
  const confidence = Math.round(Math.max(0, Math.min(92,
    input.confidence + (mapped - priorMapped) * 8 + (coverage - priorCoverage) * 20,
  )));

  return {
    assessable: true,
    reqmap,
    gaps,
    score,
    rec,
    recRule,
    confidence,
    capabilityAlignment: Math.round(capabilityAlignment),
    coveragePct: Math.round(coverage * 100),
    mappedCount: mapped,
    totalRequirements: total,
    passFailBlocked,
    changes,
  };
}
