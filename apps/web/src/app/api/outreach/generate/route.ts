import { NextResponse } from "next/server";
import { z } from "zod";
import { OutreachBriefing } from "@opportunity-engine/contracts";
import {
  generateOutreachDraft,
  ModelGatewayError,
  runWithAnthropicKey,
} from "@opportunity-engine/ai";
import { resolveModelAccess } from "@/lib/org-model";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 20;
const attempts = new Map<string, { count: number; resetAt: number }>();

const GenerateBody = z.object({
  briefing: OutreachBriefing,
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
  const resolved = await resolveModelAccess();
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const ready = Boolean(resolved.access.apiKey);
  return NextResponse.json({
    ready,
    providers: { claude: ready },
    hint: ready ? undefined : resolved.access.missingMessage,
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
    return NextResponse.json({ error: "Invalid outreach briefing", issues: parsed.error.flatten() }, { status: 400 });
  }

  const resolved = await resolveModelAccess();
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (!resolved.access.apiKey) {
    return NextResponse.json({ error: resolved.access.missingMessage, code: "keys_missing" }, { status: 503 });
  }

  try {
    const draft = await runWithAnthropicKey(resolved.access.apiKey, () => generateOutreachDraft(parsed.data.briefing));
    return NextResponse.json(draft);
  } catch (err) {
    if (err instanceof ModelGatewayError) {
      const status = err.code === "keys_missing" ? 503 : 502;
      return NextResponse.json(
        { error: err.message, code: err.code, providers: { claude: true } },
        { status },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Model returned an invalid draft", issues: err.flatten() }, { status: 502 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to generate outreach" },
      { status: 502 },
    );
  }
}
