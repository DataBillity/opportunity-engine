/**
 * Solicitation updates and proposed plays.
 * Derived plays still come from Partner records. This module records
 * solicitation outcomes on the matched play, and scores a play someone proposes.
 */

import {
  buildPlaysFromPartners,
  industryMatchKind,
  type ExperienceCloseness,
  type Play,
  type PlayAssessment,
  type PlayBuilderInput,
  type PlayCoverageGap,
  type PlayExperienceCredit,
  type PlayPartnerRef,
  type PlaySignal,
  type PlaySolicitation,
  type PlayStrength,
} from "./play-builder";

export interface PlayProposalInput {
  name: string;
  problem: string;
  sector: string;
  orgType: string;
  services: string[];
}

export interface SolicitationPlayEvent {
  solicitationId: string;
  issuer: string;
  type: PlaySolicitation["type"];
  date: string;
  outcome: PlaySolicitation["outcome"];
  title: string;
  objective: string;
  services: string[];
  challenges: string[];
  sector?: string;
  orgType?: string;
  reason?: string;
}

const GENERIC = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "over", "under",
  "modernization", "modernize", "system", "systems", "platform", "platforms",
  "service", "services", "solution", "solutions", "project", "projects",
  "support", "management", "program", "programs", "integration",
]);

function distinctiveTokens(text: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 4 || GENERIC.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    tokens.push(raw);
  }
  return tokens;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter(value => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function isProposed(play: Play): boolean {
  return play.origin === "proposed" || Boolean(play.proposal);
}

function within24Months(date: string, now: Date): boolean {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return true;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - 24);
  return parsed >= cutoff;
}

function dedupeGaps(gaps: PlayCoverageGap[]): PlayCoverageGap[] {
  const seen = new Set<string>();
  const next: PlayCoverageGap[] = [];
  for (const gap of gaps) {
    const key = gap.service.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(gap);
  }
  return next;
}

function recountStrength(play: Play, now: Date): PlayStrength {
  const recent = play.solicitations.filter(item => within24Months(item.date, now));
  const bidOutcomes = new Set(["submitted", "shortlisted", "won", "lost"]);
  const lines: string[] = [];
  const tally = (outcome: PlaySolicitation["outcome"], label: string) => {
    const counts = new Map<string, number>();
    for (const item of recent) {
      if (item.outcome !== outcome || !item.reason?.trim()) continue;
      const reason = item.reason.trim();
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    for (const [reason, count] of counts) {
      if (count >= 2) lines.push(`Repeated ${label}: ${reason}`);
    }
  };
  tally("lost", "loss");
  tally("no-bid", "no-bid");
  if (recent.some(item => item.outcome === "won") && !play.proven) {
    lines.push("A win counts toward strength. The play stays unproven until that work is recorded as a Partner Experience.");
  }
  return {
    experienceCount: play.experiences.length,
    partnerCount: unique(play.experiences.map(ref => ref.partner).concat(play.capabilities.map(ref => ref.partner))).length,
    solicitationsSeen: recent.length,
    bid: recent.filter(item => bidOutcomes.has(item.outcome)).length,
    won: recent.filter(item => item.outcome === "won").length,
    notes: lines.join(" "),
  };
}

function mergeSignals(fresh: PlaySignal[], prior: PlaySignal[]): PlaySignal[] {
  const byId = new Map(fresh.map(signal => [signal.signalId, { ...signal, examples: [...signal.examples], sources: [...signal.sources] }]));
  for (const signal of prior) {
    const existing = byId.get(signal.signalId);
    if (!existing) {
      byId.set(signal.signalId, { ...signal, examples: [...signal.examples], sources: [...signal.sources] });
      continue;
    }
    existing.examples = unique([...existing.examples, ...signal.examples]);
    existing.sources = unique([...existing.sources, ...signal.sources]);
  }
  return [...byId.values()];
}

function mergeDerivedOverlay(fresh: Play, prior: Play, now: Date): Play {
  const solicitations = prior.solicitations ?? [];
  const merged: Play = {
    ...fresh,
    origin: "derived",
    targetOrganizations: {
      types: unique([...fresh.targetOrganizations.types, ...prior.targetOrganizations.types]),
      sectors: unique([...fresh.targetOrganizations.sectors, ...prior.targetOrganizations.sectors]),
      sizeRange: fresh.targetOrganizations.sizeRange,
      adjacentSectors: unique([...fresh.targetOrganizations.adjacentSectors, ...prior.targetOrganizations.adjacentSectors]),
    },
    signals: mergeSignals(fresh.signals, prior.signals),
    solicitations,
    coverageGaps: dedupeGaps([...(fresh.coverageGaps ?? []), ...(prior.coverageGaps ?? [])]),
    createdAt: prior.createdAt || fresh.createdAt,
    updatedAt: prior.updatedAt || fresh.updatedAt,
    version: Math.max(fresh.version, prior.version),
  };
  const strength = recountStrength(merged, now);
  return {
    ...merged,
    strength: {
      ...strength,
      experienceCount: fresh.strength.experienceCount,
      partnerCount: fresh.strength.partnerCount,
    },
  };
}

function problemOverlap(label: string, services: string[], experience: PlayBuilderInput["experiences"][number]): boolean {
  const hay = [experience.name, experience.summary, ...(experience.services ?? [])].join(" ").toLowerCase();
  for (const service of services) {
    const phrase = service.trim().toLowerCase();
    if (phrase.length > 2 && hay.includes(phrase)) return true;
  }
  const needles = distinctiveTokens(`${label} ${services.join(" ")}`);
  if (!needles.length) return false;
  const hayTokens = new Set(distinctiveTokens(hay));
  const hits = needles.filter(token => hayTokens.has(token));
  if (hits.length >= 2) return true;
  return hits.some(token => token.length >= 6);
}

function coveredByGraph(phrase: string, input: PlayBuilderInput): boolean {
  const needle = phrase.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    ...input.capabilities.filter(item => item.status !== "Archived").map(item => item.name),
    ...input.experiences.filter(item => item.status !== "Archived").flatMap(item => [item.name, item.summary, ...(item.services ?? [])]),
  ].join(" ").toLowerCase();
  return hay.includes(needle);
}

function closenessRank(value: ExperienceCloseness): number {
  return { direct: 0, close: 1, adjacent: 2, none: 3 }[value];
}

export function assessProposedPlay(input: PlayProposalInput, graph: PlayBuilderInput, now = new Date()): Play {
  const name = input.name.trim();
  const problem = input.problem.trim();
  const sector = input.sector.trim();
  const orgType = input.orgType.trim();
  const services = unique(input.services.map(service => service.trim()).filter(Boolean));
  const partnerName = (id: string) => graph.partners.find(partner => partner.id === id)?.name ?? id;
  const credits: PlayExperienceCredit[] = [];
  const notes: string[] = [];
  const expRefs: PlayPartnerRef[] = [];
  const partnerIds = new Set<string>();

  for (const experience of graph.experiences.filter(item => item.status !== "Archived" && item.status !== "Retired" && item.status !== "Removed")) {
    const overlap = problemOverlap(name, services, experience);
    const industry = industryMatchKind(sector, experience.industry);
    if (sector && industry === "exact" && !overlap) {
      notes.push(`${experience.name} is in ${experience.industry}, and it does not deliver this problem.`);
      continue;
    }
    if (!overlap) continue;

    let closeness: ExperienceCloseness = "adjacent";
    let transferable = false;
    let reason = `Delivered this problem in ${experience.industry || "an unstated industry"}.`;
    if (!sector) {
      closeness = "close";
    } else if (industry === "exact") {
      closeness = "direct";
      reason = `Delivered this problem in ${experience.industry}.`;
    } else if (industry === "adjacent") {
      closeness = "close";
      transferable = true;
      reason = `Transferable: delivered this problem in adjacent industry ${experience.industry}, not in ${sector}.`;
    } else {
      closeness = "adjacent";
      transferable = true;
      reason = `Transferable: delivered this problem in ${experience.industry || "another industry"}. ${sector} is not the same or an adjacent industry, so this is not its own play.`;
    }

    const partners = experience.partners.map(partnerName);
    credits.push({
      recordId: experience.id,
      summary: experience.name,
      partner: partners.join(", ") || "—",
      industry: experience.industry,
      closeness,
      transferable,
      reason,
    });
    for (const pid of experience.partners) {
      partnerIds.add(pid);
      expRefs.push({
        partner: partnerName(pid),
        recordId: experience.id,
        recordType: "experience",
        summary: experience.name,
      });
    }
  }

  credits.sort((a, b) => closenessRank(a.closeness) - closenessRank(b.closeness));
  const best = credits[0]?.closeness ?? "none";
  const proven = credits.some(credit => credit.closeness === "direct") || (!sector && credits.length > 0);

  const capRefs: PlayPartnerRef[] = [];
  for (const capability of graph.capabilities.filter(item => item.status !== "Archived")) {
    const matches = problemOverlap(name, services, {
      id: capability.id,
      name: capability.name,
      partners: capability.partners,
      industry: "",
      services: [capability.name],
      technologies: [],
      summary: capability.name,
      status: capability.status,
    });
    if (!matches) continue;
    for (const pid of capability.partners) {
      partnerIds.add(pid);
      capRefs.push({
        partner: partnerName(pid),
        recordId: capability.id,
        recordType: "capability",
        summary: capability.name,
      });
    }
  }

  const credRefs: PlayPartnerRef[] = [];
  for (const credential of graph.credentials.filter(item => item.status !== "Archived")) {
    if (!partnerIds.has(credential.partner)) continue;
    credRefs.push({
      partner: partnerName(credential.partner),
      recordId: credential.id,
      recordType: "credential",
      summary: `${credential.name} (${credential.credType})`,
    });
  }

  const peopleRefs: PlayPartnerRef[] = [];
  for (const person of graph.people.filter(item => item.status !== "Archived")) {
    const industryOk = sector ? (person.industries ?? []).some(industry => industryMatchKind(sector, industry) !== "none") : false;
    const expertiseOk = problemOverlap(name, services, {
      id: person.id,
      name: person.name,
      partners: [person.partner],
      industry: "",
      services: [],
      technologies: [],
      summary: person.expertise,
      status: person.status,
    });
    if (!industryOk && !expertiseOk) continue;
    peopleRefs.push({
      partner: partnerName(person.partner),
      recordId: person.id,
      recordType: "person",
      summary: `${person.name} — ${person.roles[0] ?? "Contributor"}`,
    });
  }

  const gaps: PlayCoverageGap[] = [];
  for (const service of services) {
    if (!coveredByGraph(service, graph)) {
      gaps.push({
        service,
        evidence: "Named on the proposed play and not found on a Partner capability or experience.",
      });
    }
  }
  if (sector && !credits.some(credit => credit.closeness === "direct")) {
    const from = unique(credits.filter(credit => credit.transferable).map(credit => credit.industry).filter(Boolean));
    gaps.push({
      service: `Delivery in ${sector}`,
      evidence: from.length
        ? `No Partner Experience delivers this problem in ${sector}. Transferable credit comes from ${from.join(", ")}.`
        : `No Partner Experience delivers this problem in ${sector}.`,
    });
  } else if (!credits.length) {
    gaps.push({
      service: name || "Proposed problem",
      evidence: "No Partner Experience covers this problem.",
    });
  }
  if (!capRefs.length) {
    gaps.push({
      service: "Capability coverage",
      evidence: "No Partner capability matches this problem.",
    });
  }

  const experiencePoints = best === "direct" ? 36 : best === "close" ? 22 : best === "adjacent" ? 12 : 0;
  const extra = Math.min(8, Math.max(0, credits.length - 1) * 2);
  const capabilityPoints = capRefs.length >= 3 ? 22 : capRefs.length >= 1 ? 12 : 0;
  const credentialPoints = credRefs.length ? Math.min(15, 5 + credRefs.length * 3) : 0;
  const peoplePoints = peopleRefs.length ? Math.min(15, 6 + peopleRefs.length * 3) : 0;
  const fit = Math.min(100, experiencePoints + extra + capabilityPoints + credentialPoints + peoplePoints);
  const assessment: PlayAssessment = {
    fit,
    closeness: best,
    transferable: credits.some(credit => credit.transferable) && best !== "direct",
    experienceCredits: credits,
    notes,
  };

  const nowIso = now.toISOString();
  const play: Play = {
    playId: `proposed-${slug(name || "play") || "play"}`,
    status: "draft",
    origin: "proposed",
    name: name || "Proposed play",
    problem,
    targetOrganizations: {
      types: orgType ? [orgType] : [],
      sectors: sector ? [sector] : unique(credits.map(credit => credit.industry).filter(Boolean)),
      sizeRange: "Varies",
      adjacentSectors: unique(credits.filter(credit => credit.transferable).map(credit => credit.industry).filter(Boolean)),
    },
    capabilities: capRefs,
    experiences: expRefs,
    credentials: credRefs,
    people: peopleRefs,
    proven,
    signals: [],
    solicitations: [],
    coverageGaps: dedupeGaps(gaps),
    strength: {
      experienceCount: credits.length,
      partnerCount: partnerIds.size,
      solicitationsSeen: 0,
      bid: 0,
      won: 0,
      notes: assessment.transferable
        ? "Unproven in the target sector. Matching experience is transferable from another industry."
        : proven ? "" : "Unproven — no Partner Experience covers this problem.",
    },
    proposal: { sector, orgType, services },
    assessment,
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  return play;
}

function reassessStoredProposal(stored: Play, graph: PlayBuilderInput, now: Date): Play {
  const fresh = assessProposedPlay({
    name: stored.name,
    problem: stored.problem,
    sector: stored.proposal?.sector ?? stored.targetOrganizations.sectors[0] ?? "",
    orgType: stored.proposal?.orgType ?? stored.targetOrganizations.types[0] ?? "",
    services: stored.proposal?.services ?? [],
  }, graph, now);
  const merged: Play = {
    ...fresh,
    playId: stored.playId,
    status: stored.status,
    approvedAt: stored.approvedAt,
    approvedBy: stored.approvedBy,
    solicitations: stored.solicitations ?? [],
    coverageGaps: dedupeGaps([...fresh.coverageGaps, ...(stored.coverageGaps ?? []).filter(gap => gap.evidence.toLowerCase().includes("solicitation"))]),
    signals: mergeSignals(fresh.signals, stored.signals ?? []),
    createdAt: stored.createdAt,
    version: Math.max(fresh.version, stored.version),
  };
  const recounted = recountStrength(merged, now);
  return {
    ...merged,
    strength: {
      ...recounted,
      experienceCount: fresh.strength.experienceCount,
      partnerCount: fresh.strength.partnerCount,
      notes: [fresh.strength.notes, recounted.notes].filter(Boolean).join(" "),
    },
  };
}

export function composeConsortiumPlays(input: PlayBuilderInput, stored: Play[] = [], now = new Date()): Play[] {
  const derived = buildPlaysFromPartners(input);
  const overlays = new Map(stored.filter(play => !isProposed(play)).map(play => [play.playId, play]));
  const composed = derived.map(play => {
    const prior = overlays.get(play.playId);
    return prior ? mergeDerivedOverlay(play, prior, now) : play;
  });
  for (const play of stored.filter(isProposed)) {
    composed.push(reassessStoredProposal(play, input, now));
  }
  return composed;
}

function matchScore(play: Play, event: SolicitationPlayEvent): number {
  const hay = [play.name, play.problem, ...play.experiences.map(ref => ref.summary), ...play.capabilities.map(ref => ref.summary)].join(" ").toLowerCase();
  let score = 0;
  for (const service of event.services) {
    const phrase = service.trim().toLowerCase();
    if (phrase.length > 2 && hay.includes(phrase)) score += 5;
  }
  const playTokens = new Set(distinctiveTokens(hay));
  for (const token of distinctiveTokens([event.title, event.objective, event.services.join(" "), event.challenges.join(" ")].join(" "))) {
    if (playTokens.has(token)) score += 1;
  }
  return score;
}

function addIssuerLanguage(play: Play, event: SolicitationPlayEvent): PlaySignal[] {
  const examples = unique([event.objective, ...event.challenges].map(text => text.trim()).filter(Boolean)).slice(0, 3)
    .map(text => text.length > 180 ? `${text.slice(0, 177)}...` : text);
  if (!examples.length) return play.signals;
  const signals = play.signals.map(signal => ({ ...signal, examples: [...signal.examples], sources: [...signal.sources] }));
  const target = signals.find(signal => signal.tier === "explicit demand");
  if (!target) {
    signals.unshift({
      signalId: `${play.playId}-issuer-language`,
      name: `Issuer language for ${play.name}`,
      tier: "explicit demand",
      examples,
      sources: ["responded solicitations"],
      halfLifeDays: 90,
    });
    return signals;
  }
  target.examples = unique([...target.examples, ...examples]);
  if (!target.sources.includes("responded solicitations")) target.sources = [...target.sources, "responded solicitations"];
  return signals;
}

function solicitationGaps(play: Play, event: SolicitationPlayEvent): PlayCoverageGap[] {
  const hay = [play.name, play.problem, ...play.capabilities.map(ref => ref.summary), ...play.experiences.map(ref => ref.summary)].join(" ").toLowerCase();
  return event.services
    .map(service => service.trim())
    .filter(service => service && !hay.includes(service.toLowerCase()))
    .map(service => ({
      service,
      evidence: `Required by solicitation ${event.solicitationId} and not covered by a Partner capability or experience on this play.`,
    }));
}

export function applySolicitationUpdate(
  plays: Play[],
  event: SolicitationPlayEvent,
  now = new Date(),
): { plays: Play[]; matchedPlayId: string | null } {
  let best: { play: Play; score: number } | null = null;
  for (const play of plays) {
    if (play.status === "retired") continue;
    if (play.origin === "proposed" && play.status !== "active") continue;
    const score = matchScore(play, event);
    if (!best || score > best.score) best = { play, score };
  }
  const serviceMatched = (best?.score ?? 0) >= 5;
  const tokenMatched = (best?.score ?? 0) >= 3;
  if (!best || (!serviceMatched && !tokenMatched)) return { plays, matchedPlayId: null };

  const current = best.play;
  const solicitation: PlaySolicitation = {
    solicitationId: event.solicitationId,
    issuer: event.issuer,
    type: event.type,
    date: event.date,
    outcome: event.outcome,
    ...(event.reason?.trim() ? { reason: event.reason.trim() } : {}),
  };
  const solicitations = [
    solicitation,
    ...current.solicitations.filter(item => item.solicitationId !== event.solicitationId),
  ];
  const eventServices = new Set(event.services.map(service => service.trim().toLowerCase()).filter(Boolean));
  const keptGaps = current.coverageGaps.filter(gap => !eventServices.has(gap.service.trim().toLowerCase()));
  const updated: Play = {
    ...current,
    targetOrganizations: {
      ...current.targetOrganizations,
      types: event.orgType ? unique([...current.targetOrganizations.types, event.orgType]) : current.targetOrganizations.types,
      sectors: event.sector ? unique([...current.targetOrganizations.sectors, event.sector]) : current.targetOrganizations.sectors,
    },
    signals: addIssuerLanguage(current, event),
    solicitations,
    coverageGaps: dedupeGaps([...keptGaps, ...solicitationGaps(current, event)]),
    updatedAt: now.toISOString(),
    version: current.version + 1,
  };
  updated.strength = {
    ...recountStrength(updated, now),
    experienceCount: current.strength.experienceCount,
    partnerCount: current.strength.partnerCount,
  };
  return {
    matchedPlayId: current.playId,
    plays: plays.map(play => play.playId === current.playId ? updated : play),
  };
}

export function storeUpdatedPlay(stored: Play[], updated: Play): Play[] {
  const origin = isProposed(updated) ? "proposed" : "derived";
  const next = { ...updated, origin } as Play;
  return [...stored.filter(play => play.playId !== next.playId), next];
}

export function approveProposedPlay(stored: Play[], playId: string, approvedBy: string, now = new Date()): Play[] {
  return stored.map(play => {
    if (play.playId !== playId || !isProposed(play)) return play;
    return {
      ...play,
      origin: "proposed",
      status: "active",
      approvedAt: now.toISOString(),
      approvedBy,
      updatedAt: now.toISOString(),
    };
  });
}
