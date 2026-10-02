import { NextResponse } from "next/server";
import {
  COOKIE_NAME,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth";
import { requestIsSameOrigin } from "@/lib/auth-shared";
import { readRequestSession } from "@/lib/org-model";
import { readMembership } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const session = await readRequestSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  let body: { organizationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  if (!organizationId) {
    return NextResponse.json({ error: "Choose an organization." }, { status: 400 });
  }
  const membership = await readMembership(organizationId, session.email);
  if (!membership) {
    return NextResponse.json({ error: "You are not a member of that organization." }, { status: 403 });
  }

  const token = await createSessionToken(session.email, organizationId);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
  return response;
}
