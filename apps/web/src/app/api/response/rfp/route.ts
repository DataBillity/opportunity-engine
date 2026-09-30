import { NextResponse } from "next/server";
import { z } from "zod";
import { parseRfpProposalPart } from "@opportunity-engine/contracts";
import {
  draftRfpProposalStep,
  getAvailableProviders,
  describeMissingKeys,
  ModelGatewayError,
  RFP_DRAFTING_PROMPT_VERSION,
  RFP_PROPOSAL_STEPS,
  type RfpProposalStep,
} from "@opportunity-engine/ai";

export const runtime = "nodejs";
export const maxDuration = 300;

/** One full draft is about ten step calls, so the limit is higher than single-draft routes. */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 60;
const attempts = new Map<string, { count: number; resetAt: number }>();

const optionalText = (max: number) => z.string().max(max).optional();

const StepBody = z.object({
  step: z.enum(RFP_PROPOSAL_STEPS as [RfpProposalStep, ...RfpProposalStep[]]),
  sources: z.object({
    documentText: z.string().min(1).max(1_500_000),
    documentNames: z.array(z.string().max(300)).max(50).optional(),
    primePartnerName: optionalText(300),
    goNoGoText: optionalText(120_000),
    capabilitiesText: optionalText(120_000),
    partnerRecordsText: optionalText(60_000),
    reviewerInstructions: optionalText(20_000),
    actionItemsText: optionalText(60_000),
    today: optionalText(40),
  }),
  plan: z.unknown().optional(),
  draft: z.unknown().optional(),
  sectionIds: z.array(z.string().max(80)).max(40).optional(),
  existingDrafts: z.record(z.string().max(120_000)).optional(),
  nextGapNumber: z.number().int().min(1).max(9999).optional(),
});

function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  if (tooManyAttempts(clientKey(request))) {
    return NextResponse.json({ error: "Too many proposal requests. Try again shortly." }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = StepBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid proposal request", issues: parsed.error.flatten() }, { status: 400 });
  }

  const providers = getAvailableProviders();
  if (!providers.claude && !providers.gemini) {
    return NextResponse.json({ error: describeMissingKeys() }, { status: 503 });
  }

  const body = parsed.data;
  try {
    const result = await draftRfpProposalStep({
      step: body.step,
      sources: body.sources,
      plan: body.plan === undefined ? undefined : parseRfpProposalPart(body.plan),
      draft: body.draft === undefined ? undefined : parseRfpProposalPart(body.draft),
      sectionIds: body.sectionIds,
      existingDrafts: body.existingDrafts,
      nextGapNumber: body.nextGapNumber,
    });
    return NextResponse.json({ ...result, promptVersion: RFP_DRAFTING_PROMPT_VERSION });
  } catch (err) {
    if (err instanceof ModelGatewayError) {
      const status = err.code === "keys_missing" ? 503 : 502;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : `The ${body.step} step failed` },
      { status: 502 },
    );
  }
}
