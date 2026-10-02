import { NextResponse } from "next/server";
import {
  COOKIE_NAME,
  createSessionToken,
  getAuthSecret,
  sessionCookieOptions,
} from "@/lib/auth";
import { requestIsSameOrigin } from "@/lib/auth-shared";
import { clientKey, tooManyAttempts } from "@/lib/auth-rate-limit";
import { emailHasPassword, upsertOperatorPassword, saveOperatorProfile } from "@/lib/operator-credentials";
import { passwordPolicyError } from "@/lib/password";
import { acceptInvite, readInvite } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!getAuthSecret()) {
    return NextResponse.json({ error: "Sign-in is not configured." }, { status: 503 });
  }
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const found = await readInvite(token);
  if (!found) {
    return NextResponse.json({ error: "This invite link is invalid or has expired." }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    email: found.email,
    organizationName: found.organizationName,
    hasPassword: await emailHasPassword(found.email),
  });
}

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  if (!getAuthSecret()) {
    return NextResponse.json({ error: "Sign-in is not configured." }, { status: 503 });
  }
  if (tooManyAttempts(`invite:${clientKey(request)}`, 8)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  let body: { token?: unknown; password?: unknown; confirm?: unknown; displayName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "This invite link is invalid or has expired." }, { status: 400 });
  }
  const preview = await readInvite(token);
  if (!preview) {
    return NextResponse.json({ error: "This invite link is invalid or has expired." }, { status: 400 });
  }

  const hasPassword = await emailHasPassword(preview.email);
  if (!hasPassword) {
    const policyError = passwordPolicyError(password);
    if (policyError) return NextResponse.json({ error: policyError }, { status: 400 });
    if (password !== confirm) {
      return NextResponse.json({ error: "Those passwords do not match." }, { status: 400 });
    }
  }

  try {
    if (!hasPassword) await upsertOperatorPassword(preview.email, password);
    if (displayName) await saveOperatorProfile(preview.email, displayName, "");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to set that password.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const accepted = await acceptInvite(token);
  if (!accepted) {
    return NextResponse.json({ error: "This invite link is invalid or has expired." }, { status: 400 });
  }

  const session = await createSessionToken(accepted.email, accepted.organizationId);
  const response = NextResponse.json({ ok: true, redirectTo: "/" });
  response.cookies.set(COOKIE_NAME, session, sessionCookieOptions());
  return response;
}
