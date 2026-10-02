import { NextResponse } from "next/server";
import { requestIsSameOrigin } from "@/lib/auth-shared";
import { clientKey, tooManyAttempts } from "@/lib/auth-rate-limit";
import { mailIsConfigured, sendOrganizationInviteEmail } from "@/lib/mail";
import { resolveModelAccess } from "@/lib/org-model";
import { inviteMember, readOrganization } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  if (tooManyAttempts(`invite-send:${clientKey(request)}`, 12)) {
    return NextResponse.json({ error: "Too many invites. Try again in a few minutes." }, { status: 429 });
  }
  const resolved = await resolveModelAccess();
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (resolved.access.membership.role !== "owner") {
    return NextResponse.json({ error: "Only an owner can invite teammates." }, { status: 403 });
  }
  if (!mailIsConfigured()) {
    return NextResponse.json({ error: "Invite email is not configured. Set RESEND_API_KEY." }, { status: 503 });
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email.includes("@") || email.length > 200) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (email === resolved.access.session.email) {
    return NextResponse.json({ error: "You are already on this team." }, { status: 400 });
  }

  const org = await readOrganization(resolved.access.session.organizationId);
  let token: string;
  try {
    const issued = await inviteMember(resolved.access.session.organizationId, email);
    token = issued.token;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to invite that person.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    await sendOrganizationInviteEmail({
      to: email,
      token,
      organizationName: org?.name ?? "your organization",
    });
  } catch {
    return NextResponse.json({ error: "The invite was saved, but the email could not be sent. Try again." }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
