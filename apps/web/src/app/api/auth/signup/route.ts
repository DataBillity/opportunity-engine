import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  COOKIE_NAME,
  createSessionToken,
  getAuthSecret,
  sessionCookieOptions,
} from "@/lib/auth";
import { requestIsSameOrigin } from "@/lib/auth-shared";
import { clientKey, tooManyAttempts } from "@/lib/auth-rate-limit";
import { assertAnthropicKey } from "@/lib/anthropic-key";
import { operatorStoreConfigured, upsertOperatorPassword, saveOperatorProfile } from "@/lib/operator-credentials";
import { passwordPolicyError } from "@/lib/password";
import { createOrganizationWorkspace } from "@/lib/shared-workspace-store";
import {
  addActiveMember,
  deleteOrganization,
  emailHasAnyMembership,
  insertOrganization,
  uniqueOrganizationSlug,
  writeAnthropicSecret,
} from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_MAX = 80;

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  if (!getAuthSecret()) {
    return NextResponse.json({ error: "Sign-up is not configured. Set AUTH_SECRET." }, { status: 503 });
  }
  if (!operatorStoreConfigured()) {
    return NextResponse.json({ error: "Sign-up is not configured. Set DATABASE_URL." }, { status: 503 });
  }
  if (tooManyAttempts(`signup:${clientKey(request)}`, 8)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  let body: {
    companyName?: unknown;
    displayName?: unknown;
    email?: unknown;
    password?: unknown;
    anthropicApiKey?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const anthropicApiKey = typeof body.anthropicApiKey === "string" ? body.anthropicApiKey.trim() : "";

  if (companyName.length < 2 || companyName.length > NAME_MAX) {
    return NextResponse.json({ error: "Enter your organization name." }, { status: 400 });
  }
  if (!displayName || displayName.length > 120) {
    return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  }
  if (!email.includes("@") || email.length > 200) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const policyError = passwordPolicyError(password);
  if (policyError) return NextResponse.json({ error: policyError }, { status: 400 });

  try {
    if (await emailHasAnyMembership(email)) {
      return NextResponse.json(
        { error: "That email already belongs to an organization. Sign in instead." },
        { status: 409 },
      );
    }
    await assertAnthropicKey(anthropicApiKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to check that Claude API key.";
    const status = message.includes("already belongs") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const organizationId = `org_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  let created = false;
  try {
    const slug = await uniqueOrganizationSlug(companyName);
    await insertOrganization({ id: organizationId, name: companyName, slug, usesPlatformKey: false });
    created = true;
    await addActiveMember({ organizationId, email, role: "owner" });
    await writeAnthropicSecret(organizationId, anthropicApiKey);
    await createOrganizationWorkspace(organizationId);
    await upsertOperatorPassword(email, password);
    await saveOperatorProfile(email, displayName, "");
  } catch (error) {
    if (created) await deleteOrganization(organizationId);
    const message = error instanceof Error ? error.message : "Unable to create the organization.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const token = await createSessionToken(email, organizationId);
  const response = NextResponse.json({ ok: true, redirectTo: "/" });
  response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
  return response;
}
