import type { Organization, Pursuit } from "@/lib/mock-data";
import type { OutreachBriefing, OutreachPursuitBrief } from "@opportunity-engine/contracts";

export function toPursuitBrief(pursuit: Pursuit): OutreachPursuitBrief {
  return {
    id: pursuit.id,
    name: pursuit.name,
    typeLabel: pursuit.typeLabel,
    solicitationRef: pursuit.solicitationRef,
    dueDate: pursuit.dueDate,
    rec: pursuit.rec,
    status: pursuit.status,
    closed: pursuit.closed,
    docSummary: {
      objective: pursuit.docSummary.objective,
      services: pursuit.docSummary.services,
      deliverables: pursuit.docSummary.deliverables,
    },
    rationale: pursuit.rationale,
    mappedRequirements: pursuit.reqmap
      .filter(item => item.status === "mapped")
      .map(item => `${item.req}${item.node ? ` — ${item.node}` : ""}`),
    gaps: pursuit.gaps.map(item => `${item.title} (${item.crit})`),
  };
}

export function preferredPursuitId(pursuits: Pursuit[]): string | null {
  const active = pursuits.filter(p => !p.closed);
  const pool = active.length ? active : pursuits;
  if (!pool.length) return null;
  return [...pool].sort((a, b) => b.score - a.score)[0]?.id ?? null;
}

export function buildOutreachBriefing(input: {
  org: Organization;
  pursuit: Pursuit | null;
  contactIndex: number;
  senderName: string;
  senderTitle?: string;
}): OutreachBriefing {
  const contact = input.org.contacts[input.contactIndex] ?? input.org.contacts[0];
  return {
    senderName: input.senderName,
    senderTitle: input.senderTitle,
    senderCompany: "DataBillity",
    organization: {
      id: input.org.id,
      name: input.org.name,
      industry: input.org.industry || undefined,
      channel: input.org.channel,
      summary: input.org.summary || undefined,
      whyGoodFit: input.org.whyGoodFit || undefined,
      score: input.org.score,
      scoreFactors: input.org.scoreFactors,
      notes: input.org.notes.map(note => note.text),
      contact: contact
        ? { name: contact.name, title: contact.title, email: contact.email }
        : undefined,
    },
    pursuit: input.pursuit ? toPursuitBrief(input.pursuit) : null,
  };
}
