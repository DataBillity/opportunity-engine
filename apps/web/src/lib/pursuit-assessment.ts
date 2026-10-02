import { PARTNER_COVERAGE_NODE, reassessPursuit, recDecisionLabel, type GoNoGoFields, type ReassessResult } from "@opportunity-engine/core";
import type {
  GraphData,
  Partner,
  Pursuit,
  PursuitAssessment,
  PursuitDecision,
  PursuitRecommendation,
} from "@/lib/mock-data";

type ProjectType = "rfp" | "rfi" | "sow";

const recLabel = recDecisionLabel;

const MAX_ASSESSMENTS = 20;

export function projectTypeOf(pursuit: Pursuit): ProjectType {
  return pursuit.projectType ?? (pursuit.lane === "C" ? "sow" : "rfp");
}

function nowIso(): string {
  return new Date().toISOString();
}

/** The user's Go/No-Go decision, including one recorded before decisions were stored separately. */
export function decisionOf(pursuit: Pursuit): PursuitDecision | undefined {
  if (pursuit.decision) return pursuit.decision;
  if (!/confirmed/i.test(pursuit.status) || (pursuit.rec !== "go" && pursuit.rec !== "nogo")) return undefined;
  return {
    value: pursuit.rec,
    reason: "",
    override: false,
    platformRec: pursuit.rec,
    reviewer: pursuit.decisionRecord.reviewer,
    at: "",
  };
}

/** The platform's own recommendation, independent of any user Go/No-Go decision. */
export function platformRecommendation(pursuit: Pursuit): PursuitRecommendation {
  if (pursuit.platformRec) return pursuit.platformRec;
  const decision = decisionOf(pursuit);
  return {
    rec: decision?.platformRec ?? pursuit.rec,
    score: pursuit.score,
    confidence: pursuit.confidence,
    reason: pursuit.scoreBreakdown?.recRule || pursuit.rationale[0] || "",
    at: "",
  };
}

/** A decision disagrees with the platform when it is Go against No-Go, or No-Go against Go / Conditional Go. */
export function isOverride(value: PursuitDecision["value"], platformRec: Pursuit["rec"]): boolean {
  return value === "go" ? platformRec === "nogo" : platformRec === "go" || platformRec === "cond";
}

export function decisionStatus(projectType: ProjectType, value: PursuitDecision["value"]): string {
  if (projectType === "rfi") return value === "go" ? "Respond confirmed" : "Pass confirmed";
  return value === "go" ? "Go confirmed" : "No-Go confirmed";
}

export interface PartnerContribution {
  partnerId: string;
  partner: Partner;
  contributions: string[];
  needed: boolean;
}

function mappedNodes(pursuit: Pursuit): string[] {
  return pursuit.reqmap.filter(row => row.status === "mapped" && row.node).map(row => row.node!);
}

function contributionsByPartner(pursuit: Pursuit, partners: Partner[], graph: GraphData): Map<string, string[]> {
  const byPartner = new Map<string, string[]>();
  const push = (id: string, text: string) => {
    const list = byPartner.get(id) ?? [];
    if (!list.includes(text)) list.push(text);
    byPartner.set(id, list);
  };
  const nodes = mappedNodes(pursuit);
  for (const cap of graph.capabilities) {
    if (cap.status === "Archived") continue;
    const used = nodes.some(node => node === cap.name || node === cap.id || node.startsWith(`${cap.id} `));
    if (!used) continue;
    for (const pid of cap.partners) push(pid, `Capability: ${cap.name}`);
  }
  for (const node of nodes) {
    if (!node.startsWith(PARTNER_COVERAGE_NODE)) continue;
    const name = node.slice(PARTNER_COVERAGE_NODE.length).trim().toLowerCase();
    const partner = partners.find(p => p.name.toLowerCase() === name);
    const row = pursuit.reqmap.find(r => r.node === node);
    if (partner) push(partner.id, `Covers gap: ${row?.req ?? node}`);
  }
  for (const gap of pursuit.gaps) {
    for (const p of partners) {
      if (p.covers.includes(gap.id)) push(p.id, `Covers gap: ${gap.title}`);
    }
  }
  return byPartner;
}

/** Partners on the opportunity: the saved team, or everyone whose capability or coverage the mapping uses. */
export function teamIdsFor(pursuit: Pursuit, partners: Partner[], graph?: GraphData): string[] {
  const active = partners.filter(p => p.status !== "Archived");
  if (pursuit.includedPartnerIds) {
    return pursuit.includedPartnerIds.filter(id => active.some(p => p.id === id));
  }
  if (!graph) return [];
  const contributing = contributionsByPartner(pursuit, partners, graph);
  return active.filter(p => contributing.has(p.id)).map(p => p.id);
}

export function partnerComposition(pursuit: Pursuit, partners: Partner[], graph?: GraphData): PartnerContribution[] {
  if (!graph) return [];
  const contributing = contributionsByPartner(pursuit, partners, graph);
  const team = new Set(teamIdsFor(pursuit, partners, graph));
  return partners
    .filter(p => p.status !== "Archived" && team.has(p.id))
    .map(p => {
      const contributions = contributing.get(p.id) ?? [];
      return { partnerId: p.id, partner: p, contributions, needed: contributions.length > 0 };
    });
}

function runReassessment(pursuit: Pursuit, partners: Partner[], graph: GraphData, teamIds: string[]): ReassessResult {
  const team = new Set(teamIds);
  const platform = platformRecommendation(pursuit);
  const breakdown = pursuit.scoreBreakdown;
  return reassessPursuit({
    projectType: projectTypeOf(pursuit),
    reqmap: pursuit.reqmap,
    gaps: pursuit.gaps,
    capabilities: graph.capabilities
      .filter(cap => cap.status !== "Archived")
      .map(cap => ({ id: cap.id, name: cap.name, partnerIds: cap.partners })),
    partners: partners
      .filter(p => p.status !== "Archived" && team.has(p.id))
      .map(p => ({ id: p.id, name: p.name, covers: p.covers })),
    partnerNames: Object.fromEntries(partners.map(p => [p.id, p.name])),
    score: pursuit.score,
    confidence: pursuit.confidence,
    rec: platform.rec,
    breakdown: breakdown
      ? {
        intentTiming: breakdown.intentTiming,
        accountValueFit: breakdown.accountValueFit,
        inboundIntentUplift: breakdown.inboundIntentUplift,
        documentOverlapCount: breakdown.documentOverlapCount,
      }
      : undefined,
  });
}

function listReqs(reqs: string[]): string {
  const shown = reqs.slice(0, 2).map(req => `“${req.length > 70 ? `${req.slice(0, 67)}…` : req}”`);
  return reqs.length > 2 ? `${shown.join(", ")} and ${reqs.length - 2} more` : shown.join(" and ");
}

export interface AssessmentOutcome {
  updates: Partial<Pursuit>;
  summary: string;
  changed: boolean;
  assessable: boolean;
}

/**
 * Re-score the opportunity for a team. Preserves any user Go/No-Go decision, updates the platform
 * recommendation, and records a short explanation of what moved and why.
 */
export function reassessForTeam(input: {
  pursuit: Pursuit;
  partners: Partner[];
  graph: GraphData;
  teamIds: string[];
  trigger: PursuitAssessment["trigger"];
  partnerName?: string;
}): AssessmentOutcome {
  const { pursuit, partners, graph, teamIds, trigger, partnerName } = input;
  const projectType = projectTypeOf(pursuit);
  const unit = projectType === "rfi" ? "topic" : "requirement";
  const platform = platformRecommendation(pursuit);
  const result = runReassessment(pursuit, partners, graph, teamIds);
  const priorMapped = pursuit.reqmap.filter(row => row.status === "mapped").length;
  const total = pursuit.reqmap.length;

  const lead = trigger === "partner_added"
    ? `Added ${partnerName ?? "partner"}.`
    : trigger === "partner_removed"
      ? `Removed ${partnerName ?? "partner"}.`
      : "Reran the assessment against the current team and Partner Network.";

  if (!result.assessable) {
    return {
      updates: { includedPartnerIds: teamIds },
      summary: `${lead} There are no mapped ${unit}s to reassess yet — upload the solicitation to score this opportunity.`,
      changed: false,
      assessable: false,
    };
  }

  const lost = result.changes.filter(change => change.to === "unmapped");
  const gained = result.changes.filter(change => change.to === "mapped");
  const parts: string[] = [lead];
  if (lost.length) {
    const who = [...new Set(lost.flatMap(change => change.partners))];
    parts.push(`${listReqs(lost.map(change => change.req))} ${lost.length === 1 ? "is" : "are"} no longer covered${who.length ? ` (was provided by ${who.join(", ")})` : ""}.`);
  }
  if (gained.length) {
    const who = [...new Set(gained.flatMap(change => change.partners))];
    parts.push(`${listReqs(gained.map(change => change.req))} ${gained.length === 1 ? "is" : "are"} now covered${who.length ? ` by ${who.join(", ")}` : ""}.`);
  }

  const scoreMoved = result.score !== platform.score;
  const recMoved = result.rec !== platform.rec;
  if (!result.changes.length) {
    parts.push(trigger === "rerun"
      ? `No ${unit} coverage changed, so the score (${result.score}) and recommendation (${recLabel(result.rec, projectType)}) stand.`
      : `${partnerName ?? "This partner"} ${trigger === "partner_added" ? "does not cover" : "was not covering"} any ${unit} in this solicitation, so the score (${result.score}) and recommendation (${recLabel(result.rec, projectType)}) are unchanged.`);
  } else {
    parts.push(`Coverage ${priorMapped}/${total} → ${result.mappedCount}/${total}; score ${platform.score} → ${result.score}.`);
    parts.push(recMoved
      ? `Recommendation ${recLabel(platform.rec, projectType)} → ${recLabel(result.rec, projectType)}: ${result.recRule}`
      : `Recommendation stays ${recLabel(result.rec, projectType)}${scoreMoved ? " — the change does not cross a coverage or score threshold" : ""}.`);
  }

  if (trigger === "rerun" && result.mappedCount < total) {
    const team = new Set(teamIds);
    const candidates = partners
      .filter(p => p.status !== "Archived" && !team.has(p.id))
      .map(p => ({ p, gain: runReassessment(pursuit, partners, graph, [...teamIds, p.id]).mappedCount - result.mappedCount }))
      .filter(item => item.gain > 0)
      .sort((a, b) => b.gain - a.gain)
      .slice(0, 2);
    if (candidates.length) {
      parts.push(`Adding ${candidates.map(({ p, gain }) => `${p.name} (+${gain} ${unit}${gain === 1 ? "" : "s"})`).join(" or ")} would close open gaps.`);
    }
  }

  const decision = decisionOf(pursuit);
  if (decision && result.rec !== "pending" && isOverride(decision.value, result.rec)) {
    parts.push(`Your ${recLabel(decision.value, projectType)} decision stands and now differs from the platform recommendation.`);
  }

  const summary = parts.join(" ");
  const at = nowIso();
  const assessment: PursuitAssessment = {
    at,
    trigger,
    summary,
    from: { score: platform.score, rec: platform.rec, mapped: priorMapped, total },
    to: { score: result.score, rec: result.rec, mapped: result.mappedCount, total },
  };
  const breakdown = pursuit.scoreBreakdown;
  const platformRec: PursuitRecommendation = {
    rec: result.rec,
    score: result.score,
    confidence: result.confidence,
    reason: result.recRule,
    at,
  };

  return {
    changed: result.changes.length > 0 || recMoved || scoreMoved,
    assessable: true,
    summary,
    updates: {
      includedPartnerIds: teamIds,
      reqmap: result.reqmap,
      gaps: result.gaps,
      score: result.score,
      confidence: result.confidence,
      platformRec,
      rec: decision ? decision.value : result.rec,
      scoreBreakdown: breakdown
        ? {
          ...breakdown,
          capabilityAlignment: result.capabilityAlignment,
          coveragePct: result.coveragePct,
          mappedCount: result.mappedCount,
          totalRequirements: result.totalRequirements,
          passFailBlocked: result.passFailBlocked,
          recRule: result.recRule,
        }
        : undefined,
      assessments: [assessment, ...(pursuit.assessments ?? [])].slice(0, MAX_ASSESSMENTS),
    },
  };
}

/** Replace the platform recommendation with a fresh RFP Go/No-Go packet. A recorded decision is kept. */
export function applyGoNoGoRerun(input: {
  pursuit: Pursuit;
  teamIds: string[];
  trigger: PursuitAssessment["trigger"];
  partnerName?: string;
  result: GoNoGoFields;
}): AssessmentOutcome {
  const { pursuit, teamIds, trigger, partnerName, result } = input;
  const projectType = projectTypeOf(pursuit);
  const platform = platformRecommendation(pursuit);
  const decision = decisionOf(pursuit);
  const scoreMoved = result.score !== platform.score;
  const recMoved = result.rec !== platform.rec;
  const lead = trigger === "partner_added"
    ? `Added ${partnerName ?? "partner"}.`
    : trigger === "partner_removed"
      ? `Removed ${partnerName ?? "partner"}.`
      : "Reran the Go/No-Go assessment against the current team and Partner Network.";
  const parts = [
    lead,
    recMoved
      ? `Recommendation ${recLabel(platform.rec, projectType)} → ${recLabel(result.rec, projectType)} (${platform.score} → ${result.score}). ${result.recRule}`
      : `Recommendation stays ${recLabel(result.rec, projectType)}${scoreMoved ? ` (score ${platform.score} → ${result.score})` : ""}.`,
  ];
  if (decision && isOverride(decision.value, result.rec)) {
    parts.push(`Your ${recLabel(decision.value, projectType)} decision stands and now differs from the platform recommendation.`);
  }
  const summary = parts.join(" ");
  const at = nowIso();
  const priorMapped = pursuit.reqmap.filter(row => row.status === "mapped").length;
  const assessment: PursuitAssessment = {
    at,
    trigger,
    summary,
    from: { score: platform.score, rec: platform.rec, mapped: priorMapped, total: pursuit.reqmap.length },
    to: { score: result.score, rec: result.rec, mapped: priorMapped, total: pursuit.reqmap.length },
  };
  return {
    changed: recMoved || scoreMoved,
    assessable: true,
    summary,
    updates: {
      includedPartnerIds: teamIds,
      goNoGo: result.assessment,
      score: result.score,
      confidence: result.confidence,
      confidenceNote: result.confidenceNote,
      rationale: result.rationale,
      platformRec: { rec: result.rec, score: result.score, confidence: result.confidence, reason: result.recRule, at },
      rec: decision ? decision.value : result.rec,
      status: decision || pursuit.closed ? pursuit.status : "Go/No-Go assessment complete",
      scoreBreakdown: pursuit.scoreBreakdown ? { ...pursuit.scoreBreakdown, recRule: result.recRule } : undefined,
      assessments: [assessment, ...(pursuit.assessments ?? [])].slice(0, MAX_ASSESSMENTS),
    },
  };
}

/** Apply a user decision. Never closes the opportunity — closing is a separate, explicit action. */
export function applyDecision(
  pursuit: Pursuit,
  value: PursuitDecision["value"],
  meta: { reason: string; reviewer: string },
): Partial<Pursuit> {
  const platform = platformRecommendation(pursuit);
  const decision: PursuitDecision = {
    value,
    reason: meta.reason.trim(),
    override: isOverride(value, platform.rec),
    platformRec: platform.rec,
    reviewer: meta.reviewer,
    at: nowIso(),
  };
  const projectType = projectTypeOf(pursuit);
  return {
    platformRec: platform,
    decision,
    decisionHistory: [decision, ...(pursuit.decisionHistory ?? [])].slice(0, MAX_ASSESSMENTS),
    rec: value,
    status: decisionStatus(projectType, value),
    decisionRecord: {
      ...pursuit.decisionRecord,
      reviewer: meta.reviewer,
      action: `${recLabel(value, projectType)} confirmed${decision.override ? ` — overrides platform ${recLabel(platform.rec, projectType)}` : ""}${decision.reason ? `: ${decision.reason}` : ""}`,
    },
  };
}

export function applyClose(pursuit: Pursuit, meta: { reason: string; reviewer: string }): Partial<Pursuit> {
  const projectType = projectTypeOf(pursuit);
  return {
    closed: true,
    closedAt: nowIso(),
    closedReason: meta.reason.trim(),
    closedBy: meta.reviewer,
    status: decisionOf(pursuit)
      ? `${decisionStatus(projectType, decisionOf(pursuit)!.value)} — closed`
      : "Closed",
    decisionRecord: {
      ...pursuit.decisionRecord,
      action: `Opportunity closed by ${meta.reviewer}${meta.reason.trim() ? `: ${meta.reason.trim()}` : ""}`,
    },
  };
}

export function applyReopen(pursuit: Pursuit): Partial<Pursuit> {
  const projectType = projectTypeOf(pursuit);
  return {
    closed: false,
    closedAt: undefined,
    closedReason: undefined,
    closedBy: undefined,
    status: decisionOf(pursuit) ? decisionStatus(projectType, decisionOf(pursuit)!.value) : "Triage complete",
  };
}
