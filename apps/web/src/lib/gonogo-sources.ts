import type { RfpGoNoGoSources } from "@opportunity-engine/ai";
import type { GraphData, Organization, Partner, Pursuit } from "@/lib/mock-data";

function clip(value: string | undefined, max = 400): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function nameFor(partners: Partner[], id: string): string {
  return partners.find(partner => partner.id === id)?.name ?? id;
}

export function buildGoNoGoSources(input: {
  documentText: string;
  documentNames?: string[];
  organizationName: string;
  partners: Partner[];
  graph: GraphData;
  pursuits?: Record<string, Pursuit> | Pursuit[];
  organizations?: Organization[];
  teamPartnerIds?: string[];
}): RfpGoNoGoSources {
  const active = input.partners.filter(partner => partner.status !== "Archived");
  const prime = active.find(partner => partner.type === "Prime");
  const team = new Set(input.teamPartnerIds ?? []);
  const onTeam = team.size
    ? active.filter(partner => team.has(partner.id)).map(partner => partner.name)
    : [];

  return {
    documentText: input.documentText,
    documentNames: input.documentNames,
    primePartnerName: prime?.name,
    capabilitiesText: formatCapabilities(active, input.graph),
    partnerRecordsText: formatPartners(active, input.graph, onTeam),
    bidHistoryText: formatBidHistory(input.organizationName, input.organizations ?? [], input.pursuits),
    reviewerInstructions: "",
  };
}

function formatCapabilities(partners: Partner[], graph: GraphData): string {
  const lines: string[] = [];
  const capabilities = graph.capabilities.filter(item => item.status !== "Archived").slice(0, 40);
  if (capabilities.length) {
    lines.push("Services:");
    for (const item of capabilities) {
      const owners = item.partners.map(id => nameFor(partners, id)).filter(Boolean);
      lines.push(`- ${item.name}${owners.length ? ` (${owners.join(", ")})` : ""}`);
    }
  }
  const experience = graph.experience.filter(item => item.status !== "Archived").slice(0, 25);
  if (experience.length) {
    lines.push("Past performance:");
    for (const item of experience) {
      const owners = item.partners.map(id => nameFor(partners, id)).filter(Boolean);
      const detail = [item.industry, clip(item.summary, 280)].filter(Boolean).join(". ");
      lines.push(`- ${item.name}${owners.length ? ` (${owners.join(", ")})` : ""}${detail ? `: ${detail}` : ""}`);
    }
  }
  const credentials = graph.credentials.filter(item => item.status !== "Archived").slice(0, 25);
  if (credentials.length) {
    lines.push("Certifications and insurance:");
    for (const item of credentials) {
      lines.push(`- ${item.name} (${item.credType}, ${item.partner}${item.scope ? `, ${clip(item.scope, 120)}` : ""}${item.expiration ? `, expires ${item.expiration}` : ""})`);
    }
  }
  const people = graph.people.filter(item => item.status !== "Archived").slice(0, 25);
  if (people.length) {
    lines.push("Key personnel:");
    for (const item of people) {
      const skills = [...item.roles, ...item.technologies].filter(Boolean).slice(0, 8).join(", ");
      lines.push(`- ${item.name}, ${item.role || "staff"}, ${item.partner}${skills ? `; ${skills}` : ""}${item.expertise ? `; ${clip(item.expertise, 180)}` : ""}`);
    }
  }
  return lines.join("\n");
}

function formatPartners(partners: Partner[], graph: GraphData, onTeam: string[]): string {
  if (!partners.length) return "";
  const lines = partners.map(partner => {
    const covers = graph.capabilities
      .filter(item => item.status !== "Archived" && item.partners.includes(partner.id))
      .map(item => item.name)
      .slice(0, 12);
    const bits = [
      `${partner.name} (${partner.type})`,
      partner.hqAddress ? `location ${clip(partner.hqAddress, 120)}` : "",
      partner.uei ? `UEI ${partner.uei}` : "",
      partner.ein ? `EIN ${partner.ein}` : "",
      partner.yearFounded ? `founded ${partner.yearFounded}` : "",
      partner.employeeHeadcount ? `${partner.employeeHeadcount} employees` : "",
      partner.primaryContact || partner.contact ? `contact ${partner.primaryContact || partner.contact}` : "",
      covers.length ? `capabilities: ${covers.join(", ")}` : "",
      partner.summary ? clip(partner.summary, 320) : "",
    ].filter(Boolean);
    return `- ${bits.join("; ")}`;
  });
  if (onTeam.length) lines.push(`Included on this pursuit: ${onTeam.join(", ")}.`);
  return lines.join("\n");
}

function formatBidHistory(
  organizationName: string,
  organizations: Organization[],
  pursuits: Record<string, Pursuit> | Pursuit[] | undefined,
): string {
  if (!pursuits) return "";
  const org = organizations.find(item => item.name === organizationName);
  const list = Array.isArray(pursuits) ? pursuits : Object.values(pursuits);
  const related = list.filter(pursuit => org ? pursuit.orgId === org.id : false).slice(0, 8);
  if (!related.length) return "";
  return related.map(pursuit => {
    const outcome = pursuit.outcome ?? pursuit.rec;
    return `- ${pursuit.name} (${pursuit.solicitationRef}): ${outcome}, score ${pursuit.score}`;
  }).join("\n");
}
