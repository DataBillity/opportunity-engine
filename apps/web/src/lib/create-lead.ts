import {
  evaluateLinkedInBatch,
  parseLinkedInConnectionsCsv,
  type LinkedInBatchResult,
} from "@opportunity-engine/core";
import type { Organization } from "./mock-data";

export const LEAD_CHANNELS = [
  { value: "Direct inquiry", label: "Direct inquiry" },
  { value: "Outbound", label: "Outbound" },
  { value: "Inbound", label: "Inbound" },
  { value: "Partner", label: "Partner" },
  { value: "Referral", label: "Referral" },
  { value: "Event", label: "Event" },
];

export interface SalesLeadInput {
  name: string;
  industry?: string;
  channel?: string;
  source?: string;
  contactName?: string;
  contactEmail?: string;
  contactTitle?: string;
  summary?: string;
  suffix?: string;
  score?: number;
}

export function createSalesLead(input: SalesLeadInput): Organization {
  const name = input.name.trim();
  const id = `ORG-${Date.now().toString().slice(-4)}${input.suffix ? `-${input.suffix}` : ""}`;
  const contactName = input.contactName?.trim() ?? "";
  const contactEmail = input.contactEmail?.trim() ?? "";
  const score = input.score ?? 50;

  return {
    id,
    name,
    industry: input.industry?.trim() ?? "",
    channel: input.channel?.trim() || "Outbound",
    source: input.source?.trim() || undefined,
    score,
    domain: "",
    registryId: "",
    summary: input.summary?.trim() ?? "",
    contacts: contactName
      ? [{ name: contactName, title: input.contactTitle?.trim() ?? "", email: contactEmail }]
      : [],
    whyGoodFit: "",
    scoreFactors: [],
    scoreHistory: [{
      score,
      at: new Date().toISOString().slice(0, 10),
      reason: "Added as a sales lead.",
    }],
    notes: [],
    pursuits: [],
  };
}

const HEADER_CELL_RE = /^(company|organization|org|name|lead|account|industry|contact|email)$/i;

export interface ParsedLeadLine {
  name: string;
  industry: string;
  contactName: string;
  contactEmail: string;
}

function isHeaderRow(parts: string[]): boolean {
  return parts.length > 0 && parts.every(part => HEADER_CELL_RE.test(part));
}

export function parseLeadLines(text: string): ParsedLeadLine[] {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const leads: ParsedLeadLine[] = [];

  for (const line of lines) {
    const parts = line.split(",").map(part => part.trim()).filter(Boolean);
    const name = parts[0] ?? "";
    if (!name || isHeaderRow(parts)) continue;

    const rest = parts.slice(1);
    const emailPart = rest.find(part => part.includes("@")) ?? "";
    const nonEmail = rest.filter(part => part !== emailPart);
    leads.push({
      name,
      industry: nonEmail[0] ?? "",
      contactName: nonEmail[1] ?? "",
      contactEmail: emailPart,
    });
  }

  return leads;
}

export function isLinkedInConnectionsCsv(text: string): boolean {
  return /(?:^|\n)\s*First Name\s*,\s*Last Name\s*,/i.test(text);
}

export interface BulkLeadParseResult {
  kind: "linkedin" | "lines";
  orgs: Organization[];
  rowCount: number;
  leadCount: number;
  companyCount: number;
  parkedCount: number;
  error?: string;
}

export function parseBulkLeads(text: string, channel = "Outbound"): BulkLeadParseResult {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    return { kind: "lines", orgs: [], rowCount: 0, leadCount: 0, companyCount: 0, parkedCount: 0 };
  }

  if (isLinkedInConnectionsCsv(trimmed)) {
    try {
      const rows = parseLinkedInConnectionsCsv(trimmed);
      const batch = evaluateLinkedInBatch(rows);
      const orgs = organizationsFromLinkedInBatch(batch);
      return {
        kind: "linkedin",
        orgs,
        rowCount: batch.rowCount,
        leadCount: batch.qualifiedCount,
        companyCount: orgs.length,
        parkedCount: (batch.routingCounts.parked ?? 0) + (batch.routingCounts.discovery ?? 0),
      };
    } catch (err) {
      return {
        kind: "linkedin",
        orgs: [],
        rowCount: 0,
        leadCount: 0,
        companyCount: 0,
        parkedCount: 0,
        error: err instanceof Error ? err.message : "Could not parse LinkedIn Connections.csv",
      };
    }
  }

  const lines = parseLeadLines(trimmed);
  const orgs = lines.map((lead, index) => createSalesLead({
    name: lead.name,
    industry: lead.industry,
    channel,
    contactName: lead.contactName,
    contactEmail: lead.contactEmail,
    suffix: String(index),
  }));
  return {
    kind: "lines",
    orgs,
    rowCount: lines.length,
    leadCount: lines.length,
    companyCount: orgs.length,
    parkedCount: 0,
  };
}

export function organizationsFromLinkedInBatch(batch: LinkedInBatchResult): Organization[] {
  const today = new Date().toISOString().slice(0, 10);
  return batch.accounts
    .filter(account => account.routing === "pipeline" && account.key !== "unattributed")
    .map(account => {
      const pipelineLeads = account.leads.filter(lead => lead.routing === "pipeline");
      const best = pipelineLeads[0] ?? account.leads[0]!;
      const why = best?.whyGoodFit ?? "";
      return {
        id: `LI-${account.key}`.slice(0, 48),
        name: account.legalName,
        industry: account.industry,
        channel: "LinkedIn",
        score: account.bestScore,
        domain: "",
        registryId: "",
        summary: why,
        contacts: pipelineLeads.map(lead => ({
          name: lead.fullName,
          firstName: lead.firstName,
          lastName: lead.lastName,
          title: lead.position,
          email: lead.email ?? "",
          company: lead.companyRaw,
          linkedinUrl: lead.url || undefined,
          connectedOn: lead.connectedOn || undefined,
        })),
        whyGoodFit: why,
        scoreFactors: [
          why,
          best?.icpVertical ? `ICP vertical: ${best.icpVertical}` : "",
          best?.commercialMotion && best.commercialMotion !== "none"
            ? `Motion: ${best.commercialMotion}`
            : "",
        ].filter(Boolean),
        scoreHistory: [{
          score: account.bestScore,
          at: today,
          reason: "LinkedIn Connections.csv — score ≥ 62 and ICP/capability fit.",
        }],
        notes: [],
        pursuits: [],
      } satisfies Organization;
    });
}

function contactKey(contact: Organization["contacts"][number]): string {
  return (contact.email || contact.linkedinUrl || contact.name).trim().toLowerCase();
}

export function mergeLeadOrganizations(existing: Organization[], incoming: Organization[]): Organization[] {
  const next = [...existing];
  for (const org of incoming) {
    const idx = next.findIndex(item => item.name.trim().toLowerCase() === org.name.trim().toLowerCase());
    if (idx < 0) {
      next.push(org);
      continue;
    }
    const current = next[idx]!;
    const seen = new Set(current.contacts.map(contactKey));
    const contacts = [...current.contacts];
    for (const contact of org.contacts) {
      const key = contactKey(contact);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      contacts.push(contact);
    }
    next[idx] = {
      ...current,
      contacts,
      score: Math.max(current.score, org.score),
      industry: current.industry || org.industry,
      summary: current.summary || org.summary,
      whyGoodFit: current.whyGoodFit || org.whyGoodFit,
      scoreFactors: current.scoreFactors.length ? current.scoreFactors : org.scoreFactors,
      channel: current.channel === "Discovery" ? org.channel : current.channel,
    };
  }
  return next;
}
