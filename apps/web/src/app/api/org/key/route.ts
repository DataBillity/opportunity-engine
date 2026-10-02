import { NextResponse } from "next/server";
import { requestIsSameOrigin } from "@/lib/auth-shared";
import { assertAnthropicKey } from "@/lib/anthropic-key";
import { resolveModelAccess } from "@/lib/org-model";
import { describeAnthropicKey, writeAnthropicSecret } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const resolved = await resolveModelAccess();
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const status = await describeAnthropicKey(resolved.access.session.organizationId);
  return NextResponse.json({
    ...status,
    role: resolved.access.membership.role,
  });
}

export async function PUT(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const resolved = await resolveModelAccess();
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (resolved.access.membership.role !== "owner") {
    return NextResponse.json({ error: "Only an owner can replace the Claude API key." }, { status: 403 });
  }

  let body: { anthropicApiKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const anthropicApiKey = typeof body.anthropicApiKey === "string" ? body.anthropicApiKey.trim() : "";
  try {
    await assertAnthropicKey(anthropicApiKey);
    await writeAnthropicSecret(resolved.access.session.organizationId, anthropicApiKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save that Claude API key.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const status = await describeAnthropicKey(resolved.access.session.organizationId);
  return NextResponse.json(status);
}
