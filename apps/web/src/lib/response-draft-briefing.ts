import type { GraphExperience, GraphPerson, Organization, Partner, Pursuit } from "@/lib/mock-data";
import type { ResponseDraftBriefing, ResponseDraftExperience, ResponseDraftPerson, ResponseDraftSection } from "@opportunity-engine/contracts";

function cleanText(text: string | undefined): string | undefined {
  const trimmed = text?.replace(/\u0000/g, "").trim();
  return trimmed || undefined;
}

export function peopleForDraft(
  assignments: Record<string, string>,
  people: GraphPerson[],
  partners: Partner[] = [],
): ResponseDraftPerson[] {
  const byId = new Map(people.map(person => [person.id, person]));
  const out: ResponseDraftPerson[] = [];
  const seen = new Set<string>();

  for (const [assignedRole, personId] of Object.entries(assignments)) {
    if (!personId || seen.has(personId)) continue;
    const person = byId.get(personId);
    if (!person || person.status === "Archived") continue;
    seen.add(personId);
    out.push({
      name: person.name,
      role: person.role || undefined,
      roles: person.roles,
      expertise: cleanText(person.expertise),
      technologies: person.technologies,
      industries: person.industries,
      assignedRole,
      partnerName: partners.find(partner => partner.id === person.partner)?.name,
      resumeText: cleanText(person.resumeText),
    });
  }

  return out;
}

export function experienceForDraft(
  assignedPeople: GraphPerson[],
  experience: GraphExperience[],
): ResponseDraftExperience[] {
  const live = experience.filter(item => item.status !== "Archived");
  const history = new Set(assignedPeople.flatMap(person => person.projectHistory ?? []));
  const linked = live.filter(item => history.has(item.id));
  const pool = linked.length ? linked : live;

  return pool.map(item => ({
    name: item.name,
    industry: item.industry || undefined,
    technologies: item.technologies,
    services: item.services ?? [],
    summary: cleanText(item.summary),
  }));
}

export function buildResponseDraftBriefing(input: {
  pursuit: Pursuit;
  org?: Organization;
  section: { id: string; name: string; ref: string };
  sections?: ResponseDraftSection[];
  assignments: Record<string, string>;
  people: GraphPerson[];
  experience?: GraphExperience[];
  capabilities?: string[];
  partners?: Partner[];
  existingDraft?: string;
  instructions?: string;
  mode?: "section" | "package";
  existingGapIds?: string[];
}): ResponseDraftBriefing {
  const partners = (input.partners ?? []).filter(partner => partner.status !== "Archived");
  const assignedPeople = peopleForDraft(input.assignments, input.people, partners);
  const assignedIds = new Set(Object.values(input.assignments).filter(Boolean));
  const assignedGraphPeople = input.people.filter(person =>
    assignedIds.has(person.id) && person.status !== "Archived",
  );

  return {
    section: {
      id: input.section.id,
      name: input.section.name,
      ref: input.section.ref || undefined,
    },
    sections: input.sections ?? [],
    mode: input.mode ?? "section",
    projectType: input.pursuit.projectType,
    instructions: cleanText(input.instructions),
    existingDraft: cleanText(input.existingDraft),
    existingGapIds: input.existingGapIds ?? [],
    partners: partners.map(partner => ({
      name: partner.name,
      role: partner.type || undefined,
      covers: partner.covers,
      summary: cleanText(partner.summary),
      confirmed: partner.teamingAgreementSigned === true,
    })),
    organization: {
      name: input.org?.name || "Unknown account",
      industry: input.org?.industry || undefined,
      summary: cleanText(input.org?.summary),
    },
    pursuit: {
      id: input.pursuit.id,
      name: input.pursuit.name,
      typeLabel: input.pursuit.typeLabel,
      solicitationRef: input.pursuit.solicitationRef || undefined,
      dueDate: input.pursuit.dueDate,
      rec: input.pursuit.rec,
      documents: input.pursuit.documents.map(doc => doc.name),
      docSummary: {
        objective: input.pursuit.docSummary.objective,
        challenges: input.pursuit.docSummary.challenges ?? [],
        services: input.pursuit.docSummary.services,
        deliverables: input.pursuit.docSummary.deliverables,
        responseConstraints: input.pursuit.docSummary.responseConstraints ?? [],
      },
      informationRequests: input.pursuit.informationRequests ?? [],
      capabilities: input.capabilities ?? [],
      mappedRequirements: input.pursuit.reqmap
        .filter(item => item.status === "mapped")
        .map(item => `${item.req}${item.node ? ` — ${item.node}` : ""}`),
      unmappedRequirements: input.pursuit.reqmap
        .filter(item => item.status === "unmapped")
        .map(item => item.req),
      gaps: input.pursuit.gaps.map(item => `${item.title} (${item.crit})`),
      rationale: input.pursuit.rationale,
      sourceExcerpt: cleanText(input.pursuit.sourceText),
    },
    people: assignedPeople,
    experience: experienceForDraft(assignedGraphPeople, input.experience ?? []),
  };
}
