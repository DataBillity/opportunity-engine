/**
 * Play Builder — turns Partner records into plays.
 * A play is a customer need the consortium can meet, grounded in Partner
 * capabilities, experiences, credentials, and people.
 *
 * Pure functions — no I/O, no network.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PlaySignal {
  signalId: string;
  name: string;
  tier: "explicit demand" | "trigger" | "pain";
  examples: string[];
  sources: string[];
  halfLifeDays: number;
}

export interface PlayPartnerRef {
  partner: string;
  recordId: string;
  recordType: "capability" | "experience" | "credential" | "person";
  summary: string;
}

export interface PlayTargetOrganizations {
  types: string[];
  sectors: string[];
  sizeRange: string;
  adjacentSectors: string[];
}

export interface PlaySolicitation {
  solicitationId: string;
  issuer: string;
  type: "RFI" | "RFP" | "SOW";
  date: string;
  outcome: "submitted" | "shortlisted" | "won" | "lost" | "no-bid" | "pending";
}

export interface PlayCoverageGap {
  service: string;
  evidence: string;
}

export interface PlayStrength {
  experienceCount: number;
  partnerCount: number;
  solicitationsSeen: number;
  bid: number;
  won: number;
  notes: string;
}

export interface Play {
  playId: string;
  status: "active" | "draft" | "retired";
  name: string;
  problem: string;
  targetOrganizations: PlayTargetOrganizations;
  capabilities: PlayPartnerRef[];
  experiences: PlayPartnerRef[];
  credentials: PlayPartnerRef[];
  people: PlayPartnerRef[];
  proven: boolean;
  signals: PlaySignal[];
  solicitations: PlaySolicitation[];
  coverageGaps: PlayCoverageGap[];
  strength: PlayStrength;
  version: number;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
}

/* ------------------------------------------------------------------ */
/*  Graph types consumed by the builder                                */
/* ------------------------------------------------------------------ */

export interface PartnerSummary {
  id: string;
  name: string;
  type: string;
}

export interface GraphCapabilityInput {
  id: string;
  name: string;
  partners: string[];
  status: string;
}

export interface GraphExperienceInput {
  id: string;
  name: string;
  partners: string[];
  industry: string;
  services: string[];
  technologies: string[];
  summary: string;
  status: string;
}

export interface GraphCredentialInput {
  id: string;
  name: string;
  credType: string;
  partner: string;
  scope: string;
  status: string;
}

export interface GraphPersonInput {
  id: string;
  name: string;
  partner: string;
  roles: string[];
  expertise: string;
  industries: string[];
  status: string;
}

export interface PlayBuilderInput {
  partners: PartnerSummary[];
  capabilities: GraphCapabilityInput[];
  experiences: GraphExperienceInput[];
  credentials: GraphCredentialInput[];
  people: GraphPersonInput[];
  existingPlays?: Play[];
}

/* ------------------------------------------------------------------ */
/*  Normalization helpers                                              */
/* ------------------------------------------------------------------ */

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function partnerName(partnerId: string, partners: PartnerSummary[]): string {
  return partners.find(p => p.id === partnerId)?.name ?? partnerId;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter(v => {
    const k = v.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const ARCHIVED = new Set(["Archived", "Retired", "Removed"]);
function isActive(status: string): boolean {
  return !ARCHIVED.has(status);
}

/* ------------------------------------------------------------------ */
/*  Problem clustering                                                 */
/* ------------------------------------------------------------------ */

/**
 * Groups experiences by the customer problem they solve, using
 * industry + service overlap. Two experiences share a cluster when
 * they have at least one service in common and relate to the same
 * or adjacent industries.
 */
interface ExperienceCluster {
  key: string;
  label: string;
  experiences: GraphExperienceInput[];
  industries: string[];
  services: string[];
  partnerIds: string[];
}

const INDUSTRY_ADJACENCY: Record<string, string[]> = {
  "government": ["government — labor & workforce", "government — benefits", "government — public sector"],
  "government — labor & workforce": ["government", "government — benefits"],
  "government — benefits": ["government", "government — labor & workforce"],
  "healthcare": ["health plan", "insurance"],
  "public transit": ["transportation", "logistics & transportation"],
  "transportation": ["public transit", "logistics & transportation"],
  "financial services": ["fintech", "insurance", "banking"],
};

function industriesOverlap(a: string, b: string): boolean {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (!la || !lb) return true;
  if (la === lb) return true;
  if (la.includes(lb) || lb.includes(la)) return true;
  const adj = INDUSTRY_ADJACENCY[la];
  return adj ? adj.some(x => lb.includes(x) || x.includes(lb)) : false;
}

function servicesOverlap(a: string[], b: string[]): boolean {
  const sa = new Set(a.map(s => s.toLowerCase().trim()));
  return b.some(s => sa.has(s.toLowerCase().trim()));
}

function clusterExperiences(experiences: GraphExperienceInput[]): ExperienceCluster[] {
  const active = experiences.filter(e => isActive(e.status));
  const clusters: ExperienceCluster[] = [];

  for (const exp of active) {
    let merged = false;
    for (const cluster of clusters) {
      if (
        (servicesOverlap(cluster.services, exp.services ?? []) ||
         exp.summary.toLowerCase().includes(cluster.label.toLowerCase().split(" ")[0] ?? ""))
        && industriesOverlap(cluster.industries[0] ?? "", exp.industry)
      ) {
        cluster.experiences.push(exp);
        cluster.industries = unique([...cluster.industries, exp.industry]);
        cluster.services = unique([...cluster.services, ...(exp.services ?? [])]);
        cluster.partnerIds = unique([...cluster.partnerIds, ...exp.partners]);
        merged = true;
        break;
      }
    }
    if (!merged) {
      const label = deriveClusterLabel(exp);
      clusters.push({
        key: slug(label),
        label,
        experiences: [exp],
        industries: exp.industry ? [exp.industry] : [],
        services: [...(exp.services ?? [])],
        partnerIds: [...exp.partners],
      });
    }
  }
  return clusters;
}

function deriveClusterLabel(exp: GraphExperienceInput): string {
  const services = (exp.services ?? []).slice(0, 2).join(" and ");
  const industrySuffix = exp.industry ? ` (${exp.industry})` : "";
  if (services) return `${services} modernization${industrySuffix}`;
  const nameWords = exp.name.split(/\s*[—–-]\s*/)[1]?.trim();
  if (nameWords) return nameWords;
  return exp.name;
}

/* ------------------------------------------------------------------ */
/*  Signal generation                                                  */
/* ------------------------------------------------------------------ */

function buildDefaultSignals(cluster: ExperienceCluster): PlaySignal[] {
  const signals: PlaySignal[] = [];
  const keyword = cluster.label.split(" ")[0]?.toLowerCase() ?? "system";

  signals.push({
    signalId: `${cluster.key}-solicitation`,
    name: `Solicitation for ${cluster.label.toLowerCase()}`,
    tier: "explicit demand",
    examples: [`RFP or RFI for ${cluster.label.toLowerCase()}`],
    sources: ["procurement portals", "government contract databases"],
    halfLifeDays: 90,
  });

  signals.push({
    signalId: `${cluster.key}-budget`,
    name: `Budget request mentioning ${keyword}`,
    tier: "trigger",
    examples: [`budget change proposal citing ${keyword} systems`, `IT plan targeting ${keyword} modernization`],
    sources: ["state budget documents", "IT strategic plans", "board minutes"],
    halfLifeDays: 365,
  });

  signals.push({
    signalId: `${cluster.key}-pain`,
    name: `Reported issues with ${keyword} processes`,
    tier: "pain",
    examples: [`audit finding on ${keyword} processing times`, `news of backlogs or delays`],
    sources: ["audit reports", "news", "board minutes"],
    halfLifeDays: 180,
  });

  return signals;
}

/* ------------------------------------------------------------------ */
/*  Play builder (full rebuild)                                        */
/* ------------------------------------------------------------------ */

export function buildPlaysFromPartners(input: PlayBuilderInput): Play[] {
  const now = new Date().toISOString();
  const clusters = clusterExperiences(input.experiences);
  const plays: Play[] = [];

  for (const cluster of clusters) {
    const capRefs: PlayPartnerRef[] = [];
    const expRefs: PlayPartnerRef[] = [];
    const credRefs: PlayPartnerRef[] = [];
    const peopleRefs: PlayPartnerRef[] = [];

    for (const exp of cluster.experiences) {
      for (const pid of exp.partners) {
        expRefs.push({
          partner: partnerName(pid, input.partners),
          recordId: exp.id,
          recordType: "experience",
          summary: exp.name,
        });
      }
    }

    for (const cap of input.capabilities.filter(c => isActive(c.status))) {
      const relevant = cluster.experiences.some(e =>
        e.summary.toLowerCase().includes(cap.name.toLowerCase().split(" ")[0]?.toLowerCase() ?? "") ||
        cap.name.toLowerCase().includes(cluster.label.toLowerCase().split(" ")[0]?.toLowerCase() ?? "")
      );
      if (!relevant) {
        const partnerOverlap = cap.partners.some(pid => cluster.partnerIds.includes(pid));
        if (!partnerOverlap) continue;
      }
      for (const pid of cap.partners) {
        capRefs.push({
          partner: partnerName(pid, input.partners),
          recordId: cap.id,
          recordType: "capability",
          summary: cap.name,
        });
      }
    }

    for (const cred of input.credentials.filter(c => isActive(c.status))) {
      if (cluster.partnerIds.includes(cred.partner)) {
        credRefs.push({
          partner: partnerName(cred.partner, input.partners),
          recordId: cred.id,
          recordType: "credential",
          summary: `${cred.name} (${cred.credType})`,
        });
      }
    }

    for (const person of input.people.filter(p => isActive(p.status))) {
      if (!cluster.partnerIds.includes(person.partner)) continue;
      const industryMatch = (person.industries ?? []).some(pi =>
        cluster.industries.some(ci => industriesOverlap(pi, ci))
      );
      if (industryMatch || person.expertise.toLowerCase().includes(cluster.label.toLowerCase().split(" ")[0]?.toLowerCase() ?? "")) {
        peopleRefs.push({
          partner: partnerName(person.partner, input.partners),
          recordId: person.id,
          recordType: "person",
          summary: `${person.name} — ${person.roles[0] ?? "Contributor"}`,
        });
      }
    }

    const partnerNames = unique([
      ...expRefs.map(r => r.partner),
      ...capRefs.map(r => r.partner),
    ]);

    const targetTypes = unique(
      cluster.experiences.flatMap(e => {
        const types: string[] = [];
        if (/state|dept|department|agency/i.test(e.name)) types.push("state agency");
        if (/county|city|municipal/i.test(e.name)) types.push("local government");
        if (/transit|transportation/i.test(e.name) || /transit/i.test(e.industry)) types.push("transit or special district");
        if (/health|hospital|medical/i.test(e.name) || /healthcare/i.test(e.industry)) types.push("healthcare provider");
        if (!types.length) types.push("organization");
        return types;
      })
    );

    const proven = cluster.experiences.length > 0;

    plays.push({
      playId: cluster.key,
      status: "draft",
      name: cluster.label,
      problem: `Organizations with ${cluster.label.toLowerCase()} needs that the consortium's experience and capabilities can address.`,
      targetOrganizations: {
        types: targetTypes,
        sectors: unique(cluster.industries.map(i => i.toLowerCase())),
        sizeRange: "Varies",
        adjacentSectors: unique(
          cluster.industries.flatMap(i => INDUSTRY_ADJACENCY[i.toLowerCase()] ?? [])
        ),
      },
      capabilities: capRefs,
      experiences: expRefs,
      credentials: credRefs,
      people: peopleRefs,
      proven,
      signals: buildDefaultSignals(cluster),
      solicitations: [],
      coverageGaps: [],
      strength: {
        experienceCount: cluster.experiences.length,
        partnerCount: partnerNames.length,
        solicitationsSeen: 0,
        bid: 0,
        won: 0,
        notes: proven ? "" : "Unproven — no completed delivery recorded as an Experience.",
      },
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  return plays;
}

/* ------------------------------------------------------------------ */
/*  Fit scoring against plays                                          */
/* ------------------------------------------------------------------ */

export type RelationshipLevel =
  | "Met in person"
  | "Referral"
  | "Network connection"
  | "Prior interaction"
  | "Sourced list";

const RELATIONSHIP_SCORES: Record<RelationshipLevel, number> = {
  "Met in person": 12,
  "Referral": 10,
  "Network connection": 6,
  "Prior interaction": 6,
  "Sourced list": 2,
};

export type ExperienceCloseness = "direct" | "close" | "adjacent" | "none";

export interface PlayMatchResult {
  playId: string;
  playName: string;
  why: string;
  closeness: ExperienceCloseness;
  partnerMatches: PlayPartnerRef[];
}

export interface FitScoreBreakdown {
  experience: number;
  capability: number;
  credentialsAccess: number;
  sizeType: number;
  relationship: number;
  total: number;
  reasons: Record<string, string>;
  bestPlayId: string | null;
  bestPlayName: string | null;
  playMatches: PlayMatchResult[];
}

export interface FitScoreInput {
  orgName: string;
  orgType: string;
  sector: string;
  sizeBand: string;
  orgText: string;
  contactCount: number;
  hasDecisionMaker: boolean;
  hasInfluencer: boolean;
  relationshipLevel: RelationshipLevel;
  plays: Play[];
}

function experienceCloseness(play: Play, sector: string, orgType: string, orgText: string): ExperienceCloseness {
  if (!play.experiences.length) return "none";
  const sectorMatch = play.targetOrganizations.sectors.some(s =>
    sector.toLowerCase().includes(s) || s.includes(sector.toLowerCase())
  );
  const typeMatch = play.targetOrganizations.types.some(t =>
    orgType.toLowerCase().includes(t) || t.includes(orgType.toLowerCase())
  );
  const problemMatch = orgText.toLowerCase().includes(play.name.split(" ")[0]?.toLowerCase() ?? "");

  if (sectorMatch && typeMatch && problemMatch) return "direct";
  if ((sectorMatch && typeMatch) || (sectorMatch && problemMatch) || (typeMatch && problemMatch)) return "close";
  if (sectorMatch || typeMatch || problemMatch) return "adjacent";
  return "none";
}

export function scoreFitAgainstPlays(input: FitScoreInput): FitScoreBreakdown {
  const matches: PlayMatchResult[] = [];

  for (const play of input.plays) {
    if (play.status === "retired") continue;
    const closeness = experienceCloseness(play, input.sector, input.orgType, input.orgText);
    if (closeness === "none") continue;

    matches.push({
      playId: play.playId,
      playName: play.name,
      why: `${input.orgType} in ${input.sector}; ${closeness} match to ${play.name}`,
      closeness,
      partnerMatches: [...play.experiences, ...play.capabilities, ...play.credentials, ...play.people],
    });
  }

  const best = matches.sort((a, b) => {
    const order: Record<ExperienceCloseness, number> = { direct: 0, close: 1, adjacent: 2, none: 3 };
    return order[a.closeness] - order[b.closeness];
  })[0];

  const closeness = best?.closeness ?? "none";

  // Experience (0-30)
  let experience: number;
  let experienceReason: string;
  if (closeness === "direct") {
    const expCount = best ? input.plays.find(p => p.playId === best.playId)?.experiences.length ?? 0 : 0;
    experience = Math.min(30, 25 + Math.min(5, expCount));
    experienceReason = `Direct match: ${best?.playName ?? "play"}`;
  } else if (closeness === "close") {
    experience = 18;
    experienceReason = `Close match: ${best?.playName ?? "play"} (two of three factors)`;
  } else if (closeness === "adjacent") {
    experience = 9;
    experienceReason = `Adjacent match: ${best?.playName ?? "play"} (one factor)`;
  } else {
    experience = 2;
    experienceReason = "No play match found";
  }
  const bestPlay = best ? input.plays.find(p => p.playId === best.playId) : null;
  if (bestPlay && !bestPlay.proven && experience > 14) {
    experience = 14;
    experienceReason += " (capped: play is unproven)";
  }

  // Capability (0-20)
  const capCount = bestPlay?.capabilities.length ?? 0;
  let capability: number;
  let capabilityReason: string;
  if (capCount >= 3) {
    capability = 18;
    capabilityReason = `${capCount} capabilities cover the play's needs`;
  } else if (capCount >= 1) {
    capability = 11;
    capabilityReason = `${capCount} capability partially covers the play`;
  } else {
    capability = 3;
    capabilityReason = "Minimal capability coverage";
  }

  // Credentials/Access (0-15)
  const credCount = bestPlay?.credentials.length ?? 0;
  let credentialsAccess = Math.min(15, 5 + credCount * 4);
  const credReason = credCount > 0
    ? `${credCount} credential(s) relevant`
    : "No play-specific credentials";

  // Size/Type (0-15)
  let sizeType: number;
  let sizeReason: string;
  if (input.sizeBand === "unknown") {
    sizeType = 8;
    sizeReason = "Size unknown — capped at 8";
  } else {
    sizeType = 12;
    sizeReason = "Size within range of Partners' prior clients";
  }

  // Relationship (0-20)
  let relationship = RELATIONSHIP_SCORES[input.relationshipLevel] ?? 2;
  if (input.hasDecisionMaker) relationship = Math.min(20, relationship + 4);
  else if (input.hasInfluencer) relationship = Math.min(20, relationship + 2);
  if (input.contactCount > 1) relationship = Math.min(20, relationship + 2);
  const relReason = `${input.relationshipLevel}; ${input.contactCount} contact(s)`;

  const total = experience + capability + credentialsAccess + sizeType + relationship;

  return {
    experience,
    capability,
    credentialsAccess,
    sizeType,
    relationship,
    total: Math.min(100, total),
    reasons: {
      experience: experienceReason,
      capability: capabilityReason,
      credentialsAccess: credReason,
      sizeType: sizeReason,
      relationship: relReason,
    },
    bestPlayId: best?.playId ?? null,
    bestPlayName: best?.playName ?? null,
    playMatches: matches,
  };
}

/* ------------------------------------------------------------------ */
/*  Opportunity scoring (after enrichment)                             */
/* ------------------------------------------------------------------ */

export interface OpportunityScoreInput {
  need: number;      // 0-35
  timing: number;    // 0-20
  fitScore: number;  // 0-100
}

export interface OpportunityScoreResult {
  need: number;
  timing: number;
  fitContribution: number;
  total: number;
  scoreMath: string;
}

export function computeOpportunityScore(input: OpportunityScoreInput): OpportunityScoreResult {
  const fitContribution = Math.round(input.fitScore * 0.45);
  const total = Math.min(100, input.need + input.timing + fitContribution);
  return {
    need: input.need,
    timing: input.timing,
    fitContribution,
    total,
    scoreMath: `${input.need} + ${input.timing} + round(${input.fitScore} × 0.45 = ${input.fitScore * 0.45}) = ${total}`,
  };
}
