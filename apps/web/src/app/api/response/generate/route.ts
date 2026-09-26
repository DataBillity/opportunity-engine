import { NextResponse } from "next/server";
import { z } from "zod";
import { ResponseDraftBriefing } from "@opportunity-engine/contracts";
import {
  generateResponseDraft,
  generateRfiResponsePackage,
  getAvailableProviders,
  describeMissingKeys,
  ModelGatewayError,
} from "@opportunity-engine/ai";

export const runtime = "nodejs";
export const maxDuration = 120;

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 20;
const attempts = new Map<string, { count: number; resetAt: number }>();

const GenerateBody = z.object({
  briefing: ResponseDraftBriefing,
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

export async function GET() {
  const providers = getAvailableProviders();
  return NextResponse.json({
    ready: providers.claude || providers.gemini,
    providers,
    hint: providers.claude || providers.gemini ? undefined : describeMissingKeys(),
  });
}

export async function POST(request: Request) {
  if (tooManyAttempts(clientKey(request))) {
    return NextResponse.json({ error: "Too many generate requests. Try again shortly." }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = GenerateBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid response briefing", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const briefing = parsed.data.briefing;
    if (briefing.mode === "package") {
      if (briefing.projectType !== "rfi") {
        return NextResponse.json({ error: "Package drafts are for RFI responses." }, { status: 400 });
      }
      const draft = await generateRfiResponsePackage(briefing);
      return NextResponse.json({ kind: "package", ...draft });
    }
    const draft = await generateResponseDraft(briefing);
    return NextResponse.json({ kind: "section", ...draft });
  } catch (err) {
    if (err instanceof ModelGatewayError) {
      const status = err.code === "keys_missing" ? 503 : 502;
      return NextResponse.json(
        { error: err.message, code: err.code, providers: getAvailableProviders() },
        { status },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Model returned an invalid draft", issues: err.flatten() }, { status: 502 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to generate response draft" },
      { status: 502 },
    );
  }
}
