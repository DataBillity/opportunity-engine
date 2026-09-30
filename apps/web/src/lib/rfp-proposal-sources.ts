import type { RfpProposalSources } from "@opportunity-engine/ai";
import type { GraphData, GraphPerson, Partner, Pursuit } from "@/lib/mock-data";
import { gapLogRows } from "@/lib/gap-log";

function clip(value: string | undefined, max: number): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function nameFor(partners: Partner[], id: string): string {
  return partners.find(partner => partner.id === id)?.name ?? id;
}

export function primePartnerOf(partners: Partner[] | undefined): Partner | undefined {
  return (partners ?? []).find(partner => partner.status !== "Archived" && partner.type === "Prime");
}

/** The Prime Partner and the partners included on this pursuit; every active partner when none are included. */
function teamFor(pursuit: Pursuit, partners: Partner[]): Partner[] {
  const active = partners.filter(partner => partner.status !== "Archived");
  const included = new Set(pursuit.includedPartnerIds ?? []);
  if (!included.size) return active;
  return active.filter(partner => partner.type === "Prime" || included.has(partner.id));
}

function assignedPeople(assignments: Record<string, string>, people: GraphPerson[]): { role: string; person: GraphPerson }[] {
  return Object.entries(assignments).flatMap(([role, id]) => {
    const person = id ? people.find(item => item.id === id) : undefined;
    return person ? [{ role, person }] : [];
  });
}

function formatCapabilities(team: Partner[], graph: GraphData, assignments: Record<string, string>): string {
  const ids = new Set(team.map(partner => partner.id));
  const names = new Set(team.map(partner => partner.name));
  const owned = (partnerIds: string[]) => partnerIds.some(id => ids.has(id));
  const lines: string[] = [];

  const capabilities = graph.capabilities.filter(item => item.status !== "Archived" && owned(item.partners)).slice(0, 60);
  if (capabilities.length) {
    lines.push("Services:");
    for (const item of capabilities) lines.push(`- ${item.name} (${item.partners.map(id => nameFor(team, id)).join(", ")})`);
  }
  const experience = graph.experience.filter(item => item.status !== "Archived" && owned(item.partners)).slice(0, 30);
  if (experience.length) {
    lines.push("Past performance:");
    for (const item of experience) {
      const detail = [
        item.industry,
        item.services.length ? `services ${item.services.slice(0, 6).join(", ")}` : "",
        item.technologies.length ? `technologies ${item.technologies.slice(0, 6).join(", ")}` : "",
        clip(item.summary, 900),
      ].filter(Boolean).join(". ");
      lines.push(`- ${item.name} (${item.partners.map(id => nameFor(team, id)).join(", ")})${detail ? `: ${detail}` : ""}`);
    }
  }
  const credentials = graph.credentials.filter(item => item.status !== "Archived" && (names.has(item.partner) || ids.has(item.partner))).slice(0, 30);
  if (credentials.length) {
    lines.push("Certifications and insurance:");
    for (const item of credentials) {
      const owner = ids.has(item.partner) ? nameFor(team, item.partner) : item.partner;
      lines.push(`- ${item.name} (${item.credType}, ${owner}${item.scope ? `, ${clip(item.scope, 200)}` : ""}${item.expiration ? `, expires ${item.expiration}` : ""})`);
    }
  }

  const people = graph.people.filter(item => item.status !== "Archived" && (ids.has(item.partner) || names.has(item.partner)));
  const assigned = assignedPeople(assignments, people);
  const assignedIds = new Set(assigned.map(item => item.person.id));
  if (assigned.length) {
    lines.push("Key personnel the reviewer assigned to this proposal, with resumes:");
    for (const { role, person } of assigned) {
      lines.push(`- ${role}: ${person.name}, ${person.role || "staff"}, ${nameFor(team, person.partner)}`);
      if (person.resumeText.trim()) lines.push(`  Resume: ${clip(person.resumeText, 3000)}`);
      else if (person.expertise) lines.push(`  Expertise: ${clip(person.expertise, 400)}`);
    }
  }
  const others = people.filter(person => !assignedIds.has(person.id)).slice(0, 25);
  if (others.length) {
    lines.push("Other personnel on record (not assigned to this proposal):");
    for (const item of others) {
      const skills = [...item.roles, ...item.technologies].filter(Boolean).slice(0, 8).join(", ");
      lines.push(`- ${item.name}, ${item.role || "staff"}, ${nameFor(team, item.partner)}${skills ? `; ${skills}` : ""}${item.expertise ? `; ${clip(item.expertise, 200)}` : ""}`);
    }
  }
  return lines.join("\n");
}

function formatPartnerRecords(team: Partner[], graph: GraphData): string {
  return team.map(partner => {
    const covers = graph.capabilities
      .filter(item => item.status !== "Archived" && item.partners.includes(partner.id))
      .map(item => item.name)
      .slice(0, 15);
    const fields: [string, string | undefined][] = [
      ["Registered name", partner.name],
      ["Role", partner.type],
      ["Headquarters address", partner.hqAddress],
      ["Phone", partner.hqPhone],
      ["Email", partner.hqEmail || partner.contactEmail],
      ["Website", partner.website],
      ["UEI", partner.uei],
      ["EIN", partner.ein],
      ["Year founded", partner.yearFounded],
      ["Employees", partner.employeeHeadcount],
      ["Primary contact", partner.primaryContact || partner.contact],
      ["Teaming agreement", partner.teamingAgreementSigned == null ? undefined : partner.teamingAgreementSigned ? "signed" : "not signed"],
      ["Capabilities", covers.join(", ")],
      ["Summary", clip(partner.summary, 500)],
    ];
    const known = fields.filter(([, value]) => value?.trim()).map(([label, value]) => `  ${label}: ${value!.trim()}`);
    return [`- ${partner.name}`, ...known, "  Authorized signer: not recorded"].join("\n");
  }).join("\n");
}

function formatGoNoGo(pursuit: Pursuit): string {
  const packet = pursuit.goNoGo;
  if (!packet) return "";
  return JSON.stringify({
    recommendation: packet.recommendation,
    opportunity: packet.opportunity,
    documentMap: packet.documentMap,
    gates: packet.gates,
    issuerCriteria: packet.issuerCriteria,
    teaming: packet.teaming,
    risks: packet.risks,
    gapLog: packet.gapLog,
    issuerQuestions: packet.issuerQuestions,
    submissionRequirements: packet.submissionRequirements,
    lotAssessments: packet.lotAssessments.map(lot => ({ lot: lot.lot, recommendation: lot.recommendation.decision })),
  });
}

function formatReviewerInstructions(pursuit: Pursuit, team: Partner[], prime: Partner | undefined, assignments: Record<string, string>, people: GraphPerson[]): string {
  const lines: string[] = [];
  if (pursuit.proposalInstructions?.trim()) lines.push(pursuit.proposalInstructions.trim());
  const assigned = assignedPeople(assignments, people);
  if (assigned.length) {
    lines.push(`Key personnel for this proposal: ${assigned.map(({ role, person }) => `${role}: ${person.name}`).join("; ")}.`);
  }
  const partners = team.filter(partner => partner.id !== prime?.id).map(partner => partner.name);
  if (prime || partners.length) {
    lines.push(`Team: ${[prime ? `${prime.name} (Prime Partner)` : "", ...partners].filter(Boolean).join(", ")}.`);
  }
  if (!/\bprice|pricing|rate\b/i.test(pursuit.proposalInstructions ?? "")) {
    lines.push("No prices are provided. Leave every price as a placeholder for the Prime Partner.");
  }
  return lines.join("\n");
}

function formatActionItems(pursuit: Pursuit, partners: Partner[]): string {
  const rows = gapLogRows(pursuit, partners);
  if (!rows.length) return "";
  const resolved = rows.filter(row => row.status === "Resolved");
  const open = rows.filter(row => row.status !== "Resolved");
  const lines: string[] = [];
  if (resolved.length) {
    lines.push("Resolved (write the response into the draft; never reuse these ids):");
    for (const row of resolved) {
      const answer = row.resolution || (row.documentName ? `See file ${row.documentName}` : "Resolved with no written response");
      lines.push(`- ${row.id} [${row.location}] ${row.description}. Response from ${row.owner}: ${clip(answer, 1500)}`);
    }
  }
  if (open.length) {
    lines.push("Open (keep the id where the item still applies):");
    for (const row of open) lines.push(`- ${row.id} [${row.location}] ${row.description} (owner ${row.owner}, ${row.priority}, due ${row.dueAt || "not set"})`);
  }
  return lines.join("\n");
}

export class ProposalSourcesError extends Error {}

/** What the drafting model sees, built from the pursuit and the capability graph in the browser. */
export function buildRfpProposalSources(input: {
  pursuit: Pursuit;
  partners: Partner[];
  graph: GraphData;
  assignments: Record<string, string>;
}): RfpProposalSources {
  const { pursuit, partners, graph, assignments } = input;
  const documentText = pursuit.sourceText?.trim() ?? "";
  if (!documentText) {
    throw new ProposalSourcesError("The RFP text is not on file. Upload the RFP package on the opportunity, then draft the proposal.");
  }
  const team = teamFor(pursuit, partners);
  const prime = primePartnerOf(partners);
  const people = graph.people.filter(person => person.status !== "Archived");
  return {
    documentText,
    documentNames: pursuit.documents.map(doc => doc.name).filter(Boolean),
    primePartnerName: prime?.name,
    goNoGoText: formatGoNoGo(pursuit),
    capabilitiesText: formatCapabilities(team, graph, assignments),
    partnerRecordsText: formatPartnerRecords(team, graph),
    reviewerInstructions: formatReviewerInstructions(pursuit, team, prime, assignments, people),
    actionItemsText: formatActionItems(pursuit, partners),
    today: new Date().toISOString().slice(0, 10),
  };
}
