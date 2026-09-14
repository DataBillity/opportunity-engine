import { NextResponse } from "next/server";
import { authIsConfigured, isAllowedUsername } from "@/lib/auth";
import { requestIsSameOrigin } from "@/lib/auth-shared";
import { clientKey, tooManyAttempts } from "@/lib/auth-rate-limit";
import { mailIsConfigured, sendPasswordResetEmail } from "@/lib/mail";
import { issuePasswordResetToken, operatorStoreConfigured } from "@/lib/operator-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_OK = {
  ok: true,
  message: "If that email is authorized, we sent a link to set a password.",
};

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  if (!authIsConfigured()) {
    return NextResponse.json({ error: "Sign-in is not configured." }, { status: 503 });
  }

  if (!operatorStoreConfigured()) {
    return NextResponse.json({ error: "Password reset is not configured. Set DATABASE_URL." }, { status: 503 });
  }

  if (!mailIsConfigured()) {
    return NextResponse.json({ error: "Password reset email is not configured. Set RESEND_API_KEY." }, { status: 503 });
  }

  if (tooManyAttempts(`forgot:${clientKey(request)}`, 8)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (!isAllowedUsername(email)) {
    return NextResponse.json(GENERIC_OK);
  }

  const issued = await issuePasswordResetToken(email);
  if (!issued) {
    return NextResponse.json({ error: "Unable to start a password reset. Try again." }, { status: 503 });
  }

  try {
    await sendPasswordResetEmail({ to: email, token: issued.token });
  } catch {
    return NextResponse.json({ error: "Unable to send the reset email. Try again." }, { status: 503 });
  }

  return NextResponse.json(GENERIC_OK);
}
