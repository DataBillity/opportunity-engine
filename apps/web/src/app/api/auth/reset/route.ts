import { NextResponse } from "next/server";
import {
  COOKIE_NAME,
  authIsConfigured,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth";
import { requestIsSameOrigin } from "@/lib/auth-shared";
import { clientKey, tooManyAttempts } from "@/lib/auth-rate-limit";
import { sendPasswordUpdatedEmail } from "@/lib/mail";
import { consumePasswordResetToken, readPasswordResetToken } from "@/lib/operator-credentials";
import { passwordPolicyError } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!authIsConfigured()) {
    return NextResponse.json({ error: "Sign-in is not configured." }, { status: 503 });
  }
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const found = await readPasswordResetToken(token);
  if (!found) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, email: found.email });
}

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  if (!authIsConfigured()) {
    return NextResponse.json({ error: "Sign-in is not configured." }, { status: 503 });
  }

  if (tooManyAttempts(`reset:${clientKey(request)}`, 8)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  let body: { token?: unknown; password?: unknown; confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";
  if (!token) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }
  const policyError = passwordPolicyError(password);
  if (policyError) {
    return NextResponse.json({ error: policyError }, { status: 400 });
  }
  if (password !== confirm) {
    return NextResponse.json({ error: "Those passwords do not match." }, { status: 400 });
  }

  const consumed = await consumePasswordResetToken(token, password);
  if (!consumed) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  try {
    await sendPasswordUpdatedEmail({ to: consumed.email });
  } catch {
    // Password is already stored; do not fail the reset if the confirmation email cannot send.
  }

  const session = await createSessionToken(consumed.email);
  const response = NextResponse.json({ ok: true, redirectTo: "/" });
  response.cookies.set(COOKIE_NAME, session, sessionCookieOptions());
  return response;
}
