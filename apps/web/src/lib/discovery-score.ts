import {
  graphVersionOf,
  isStaleCapture,
  nextHotLeadId,
  scoreDiscoveredAccount,
  type DiscoveryAssessment,
  type DiscoveryField,
  type GraphNodeRef,
} from "@opportunity-engine/core";
import type { GraphData, Organization } from "@/lib/mock-data";
import { isDemonstrationOrg } from "@/lib/mock-data";

const INBOUND_CHANNELS = new Set(["Inbound", "Direct inquiry", "Referral", "Event", "Partner"]);

export function graphNodesFrom(graph: GraphData): GraphNodeRef[] {
  return [
    ...graph.capabilities.filter((item) => item.status !== "Archived").map((item) => ({
      id: item.id,
      name: item.name,
      kind: "capability" as const,
    })),
    ...graph.experience.filter((item) => item.status !== "Archived").map((item) => ({
      id: item.id,
      name: item.name,
      kind: "experience" as const,
    })),
  ];
}

export function assessmentBreakdown(assessment: DiscoveryAssessment) {
  return {
    capabilityAlignment: assessment.capabilityAlignment,
    intentTiming: assessment.intentTiming,
    accountValueFit: assessment.accountValueFit,
    inboundIntentUplift: assessment.inboundIntentUplift,
    modelVersion: assessment.modelVersion,
    promptVersion: assessment.promptVersion,
    graphVersion: assessment.graphVersion,
    runAt: assessment.runAt,
  };
}

export function organizationFromDiscovery(input: {
  name: string;
  domain?: string;
  channel: string;
  source?: string;
  summary?: string;
  contactName?: string;
  contactEmail?: string;
  contactTitle?: string;
  assessment: DiscoveryAssessment;
  fields?: DiscoveryField[];
  screenFlags?: string[];
  id?: string;
}): Organization {
  const today = input.assessment.runAt.slice(0, 10);
  const contactName = input.contactName?.trim() ?? "";
  return {
    id: input.id ?? `ORG-${Date.now().toString().slice(-6)}`,
    name: input.name.trim(),
    industry: input.assessment.industry,
    channel: input.channel,
    source: input.source,
    score: input.assessment.total,
    domain: input.domain?.trim() ?? "",
    registryId: "",
    summary: input.summary?.trim() || input.assessment.whyGoodFit,
    contacts: contactName
      ? [{ name: contactName, title: input.contactTitle?.trim() ?? "", email: input.contactEmail?.trim() ?? "" }]
      : [],
    whyGoodFit: input.assessment.whyGoodFit,
    scoreFactors: input.assessment.factors,
    scoreHistory: [{
      score: input.assessment.total,
      at: today,
      reason: "Opportunity Alignment score from sourced discovery text.",
    }],
    notes: [],
    pursuits: [],
    channelLens: input.assessment.channelLens,
    screenFlags: input.screenFlags ?? [],
    scoreBreakdown: assessmentBreakdown(input.assessment),
    enrichment: input.fields ?? [],
    hotLead: false,
  };
}

export function rescoreOrganization(org: Organization, graph: GraphData): Organization {
  if (isDemonstrationOrg(org) || org.archived) return org;
  const nodes = graphNodesFrom(graph);
  const graphVersion = graphVersionOf(nodes);
  const enrichmentText = (org.enrichment ?? [])
    .filter((field) => !isStaleCapture(field.capturedAt))
    .map((field) => field.value)
    .join("\n");
  const assessment = scoreDiscoveredAccount({
    name: org.name,
    domain: org.domain,
    industryHint: org.industry,
    text: [org.summary, org.whyGoodFit, ...(org.scoreFactors ?? []), enrichmentText].filter(Boolean).join("\n"),
    isInbound: INBOUND_CHANNELS.has(org.channel),
    priorRelationship: org.pursuits.length > 0 || org.channel === "Partner",
    graph: nodes,
    graphVersion,
    sourceType: org.channel === "LinkedIn" ? "linkedin_profile" : "public_web",
  });
  const override = org.scoreOverride;
  const score = override ? override.score : assessment.total;
  const today = assessment.runAt.slice(0, 10);
  const reason = override
    ? `Refresh kept the recorded override (${override.score}). ${override.note}`
    : "Full-pipeline rescore against the current capability graph.";
  const last = org.scoreHistory[org.scoreHistory.length - 1];
  const history = last && last.score === score && last.at === today
    ? org.scoreHistory
    : [...org.scoreHistory, { score, at: today, reason }];
  return {
    ...org,
    score,
    industry: org.industry || assessment.industry,
    whyGoodFit: assessment.whyGoodFit,
    scoreFactors: assessment.factors,
    scoreHistory: history,
    scoreBreakdown: assessmentBreakdown(assessment),
    channelLens: assessment.channelLens,
  };
}

export function rescorePipeline(orgs: Organization[], graph: GraphData): Organization[] {
  const eligible = orgs.filter((org) => !org.archived && !isDemonstrationOrg(org));
  const previousTop = [...eligible].sort((a, b) => b.score - a.score)[0];
  const rescored = orgs.map((org) => rescoreOrganization(org, graph));
  const hotId = nextHotLeadId({
    previousTopId: previousTop?.id ?? null,
    previousTopScore: previousTop?.score ?? 0,
    ranked: rescored.map((org) => ({
      id: org.id,
      score: org.score,
      eligible: !org.archived && !isDemonstrationOrg(org),
    })),
  });
  return rescored.map((org) => ({ ...org, hotLead: hotId === org.id }));
}

export function applyScoreOverride(org: Organization, score: number, note: string): Organization {
  const today = new Date().toISOString().slice(0, 10);
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return {
    ...org,
    score: bounded,
    scoreOverride: { score: bounded, note: note.trim(), at: today },
    scoreHistory: [
      ...org.scoreHistory,
      { score: bounded, at: today, reason: `Score override: ${note.trim()}` },
    ],
  };
}
