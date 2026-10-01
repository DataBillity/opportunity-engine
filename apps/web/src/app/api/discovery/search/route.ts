import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  graphVersionOf,
  matchExistingAccount,
  scoreDiscoveredAccount,
  type GraphNodeRef,
} from "@opportunity-engine/core";
import { COOKIE_NAME, readSessionToken } from "@/lib/auth";
import { requestIsSameOrigin } from "@/lib/auth-shared";
import { discoverPublicCompanies } from "@/lib/public-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SearchBody {
  company?: string;
  domain?: string;
  keyword?: string;
  industry?: string;
  minScore?: number;
  website?: boolean;
  filings?: boolean;
  graph?: GraphNodeRef[];
  accounts?: { id: string; name: string; domain?: string }[];
}

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const jar = await cookies();
  const session = await readSessionToken(jar.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => null) as SearchBody | null;
  if (!body) return NextResponse.json({ error: "Search request is invalid." }, { status: 400 });

  const company = (body.company ?? "").trim();
  const domain = (body.domain ?? "").trim();
  const keyword = (body.keyword ?? "").trim();
  const industry = (body.industry ?? "").trim();
  if (!company && !domain && !keyword) {
    return NextResponse.json({ error: "Enter a company, a domain, or a signal keyword." }, { status: 400 });
  }

  const graph = Array.isArray(body.graph)
    ? body.graph.filter((node) => node && typeof node.id === "string" && typeof node.name === "string").slice(0, 400)
    : [];
  const graphVersion = graphVersionOf(graph);
  const accounts = Array.isArray(body.accounts) ? body.accounts.slice(0, 2000) : [];
  const minScore = Number.isFinite(body.minScore) ? Number(body.minScore) : 0;

  try {
    const discovered = await discoverPublicCompanies({
      company,
      domain,
      keyword,
      sources: {
        website: body.website !== false,
        filings: body.filings !== false,
      },
    });

    const candidates = discovered.records.map((record, index) => {
      const assessment = scoreDiscoveredAccount({
        name: record.name,
        domain: record.domain,
        text: record.text,
        isInbound: false,
        priorRelationship: false,
        graph,
        graphVersion,
        capturedAt: new Date().toISOString(),
      });
      const existing = matchExistingAccount(
        { name: record.name, domain: record.domain },
        accounts,
      );
      return {
        id: `disc-${Date.now().toString().slice(-6)}-${index}`,
        org: record.name,
        industry: assessment.industry,
        signal: assessment.whyGoodFit,
        source: record.sources.join(" · ") || "Operator entry",
        score: assessment.total,
        updated: "just now",
        domain: record.domain,
        factors: assessment.factors,
        fields: record.fields,
        channelLens: assessment.channelLens,
        existingAccountId: existing?.id,
        existingReason: existing?.reason,
        assessment,
      };
    }).filter((candidate) => candidate.score >= minScore);

    if (industry && industry !== "all") {
      const narrowed = candidates.filter((candidate) => candidate.industry === industry);
      return NextResponse.json({
        candidates: narrowed,
        notes: narrowed.length === candidates.length
          ? discovered.notes
          : [...discovered.notes, `Hidden ${candidates.length - narrowed.length} result${candidates.length - narrowed.length === 1 ? "" : "s"} outside ${industry}.`],
        queriedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      candidates,
      notes: discovered.notes,
      queriedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discovery search failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
