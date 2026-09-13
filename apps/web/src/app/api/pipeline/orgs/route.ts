import { NextResponse } from "next/server";
import { createSql } from "@opportunity-engine/db";
import type { Organization } from "@/lib/mock-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LeadRow = {
  account_id: string;
  legal_name: string;
  sector: string | null;
  size_band: string | null;
  summary: string | null;
  lead_id: string;
  current_score: number | null;
  routing_outcome: string | null;
  provenance: Record<string, unknown> | null;
  intent_evidence: Record<string, unknown> | null;
  created_at: string;
};

export async function GET() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json({ organizations: [], imported: 0, reason: "DATABASE_URL is not set" });
  }

  const sql = createSql(url);
  const rows = await sql`
    SELECT
      a.id AS account_id,
      a.legal_name,
      a.sector,
      a.size_band,
      a.summary,
      l.id AS lead_id,
      l.current_score,
      l.routing_outcome,
      l.provenance,
      l.intent_evidence,
      l.created_at
    FROM lead l
    JOIN account a ON a.id = l.account_id
    WHERE l.channel = 'bulk_list'
      AND l.routing_outcome = 'pipeline'
    ORDER BY l.current_score DESC NULLS LAST, a.legal_name ASC
  ` as LeadRow[];

  const byAccount = new Map<string, Organization>();
  for (const row of rows) {
    const provenance = row.provenance ?? {};
    const evidence = row.intent_evidence ?? {};
    const existing = byAccount.get(row.account_id);
    const contact = {
      name: String(provenance.fullName ?? `${provenance.firstName ?? ""} ${provenance.lastName ?? ""}`.trim()),
      firstName: provenance.firstName ? String(provenance.firstName) : undefined,
      lastName: provenance.lastName ? String(provenance.lastName) : undefined,
      title: String(provenance.position ?? ""),
      email: String(provenance.email ?? ""),
      company: provenance.company ? String(provenance.company) : row.legal_name,
      linkedinUrl: provenance.linkedinUrl ? String(provenance.linkedinUrl) : undefined,
      connectedOn: provenance.connectedOn ? String(provenance.connectedOn) : undefined,
    };
    const why = String(evidence.why ?? row.summary ?? "");
    const score = row.current_score ?? 0;

    if (!existing) {
      byAccount.set(row.account_id, {
        id: row.account_id,
        name: row.legal_name,
        industry: prettyIndustry(row.sector),
        channel: "LinkedIn",
        score,
        domain: "",
        registryId: "",
        summary: why,
        contacts: contact.name ? [contact] : [],
        whyGoodFit: why,
        scoreFactors: [
          why,
          evidence.icpVertical ? `ICP vertical: ${String(evidence.icpVertical)}` : "",
          evidence.commercialMotion && evidence.commercialMotion !== "none"
            ? `Motion: ${String(evidence.commercialMotion)}`
            : "",
        ].filter(Boolean),
        scoreHistory: [{
          score,
          at: new Date(row.created_at).toISOString().slice(0, 10),
          reason: "LinkedIn bulk list — score ≥ 62 and ICP/capability fit.",
        }],
        notes: [],
        pursuits: [],
      });
    } else {
      if (contact.name) existing.contacts.push(contact);
      if (score > existing.score) existing.score = score;
    }
  }

  const organizations = [...byAccount.values()];
  return NextResponse.json({
    organizations,
    imported: organizations.length,
    contacts: rows.length,
  });
}

function prettyIndustry(sector: string | null): string {
  const map: Record<string, string> = {
    automotive: "Automotive OEMs & dealerships",
    financial_services: "Fintech / payments",
    marketing_agency: "Marketing agencies",
    data_provider: "Big data providers",
    travel: "Airlines",
    hospitality: "Hospitality",
    ecommerce: "E-commerce platforms",
    retail: "Retailers",
    government: "Government / public sector",
  };
  return (sector && map[sector]) || sector || "Unknown";
}
