import { NextResponse } from "next/server";
import { assessRfpGoNoGo, ModelGatewayError, runWithAnthropicKey } from "@opportunity-engine/ai";
import { enforceGoNoGoRules, goNoGoFields } from "@opportunity-engine/core";
import { buildGoNoGoSources } from "@/lib/gonogo-sources";
import { resolveModelAccess } from "@/lib/org-model";
import { readSharedWorkspace } from "@/lib/shared-workspace-store";

export const runtime = "nodejs";
export const maxDuration = 300;

const EMPTY_GRAPH = { capabilities: [], experience: [], credentials: [], people: [] };

export async function POST(request: Request) {
  let body: {
    sourceText?: string;
    documentNames?: string[];
    organizationName?: string;
    teamPartnerIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  const sourceText = body.sourceText?.trim() ?? "";
  if (!sourceText) {
    return NextResponse.json({ error: "The RFP text is missing, so the assessment cannot be rerun." }, { status: 400 });
  }
  const resolved = await resolveModelAccess();
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (!resolved.access.apiKey) {
    return NextResponse.json({ error: resolved.access.missingMessage }, { status: 503 });
  }

  const workspace = await readSharedWorkspace(resolved.access.session.organizationId).catch(() => null);
  const organizationName = body.organizationName?.trim() || "Unknown account";
  try {
    const assessed = await runWithAnthropicKey(resolved.access.apiKey, () => assessRfpGoNoGo(buildGoNoGoSources({
      documentText: sourceText,
      documentNames: body.documentNames,
      organizationName,
      partners: workspace?.partners ?? [],
      graph: workspace?.graph ?? EMPTY_GRAPH,
      pursuits: workspace?.pursuits,
      organizations: workspace?.organizations,
      teamPartnerIds: body.teamPartnerIds,
    })));
    return NextResponse.json(goNoGoFields(enforceGoNoGoRules(assessed.assessment)));
  } catch (err) {
    const message = err instanceof ModelGatewayError ? err.message : "Go/No-Go assessment failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
