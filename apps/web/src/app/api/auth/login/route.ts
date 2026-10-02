import { NextResponse } from "next/server";
import { DATABILLITY_ORG_ID } from "@opportunity-engine/db";
import {
  COOKIE_NAME,
  authIsConfigured,
  createSessionToken,
  isAllowedUsername,
  sessionCookieOptions,
} from "@/lib/auth";
import { requestIsSameOrigin, safeReturnPath } from "@/lib/auth-shared";
import { clientKey, clearAttempts, tooManyAttempts } from "@/lib/auth-rate-limit";
import { verifyLoginCredentials } from "@/lib/operator-credentials";
import { listActiveMemberships, type OrgMembership } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function membershipPayload(memberships: OrgMembership[]) {
  return memberships.map(item => ({
    id: item.organizationId,
    name: item.name,
    role: item.role,
  }));
}

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  if (!authIsConfigured()) {
    return NextResponse.json(
      { error: "Sign-in is not configured. Set AUTH_USERNAME and AUTH_SECRET." },
      { status: 503 },
    );
  }

  const key = clientKey(request);
  if (tooManyAttempts(key, 8)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  let body: { username?: unknown; password?: unknown; from?: unknown; organizationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const requestedOrg = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  if (!username || !password || !(await verifyLoginCredentials(username, password))) {
    return NextResponse.json({ error: "Those credentials don’t match our records." }, { status: 401 });
  }

  clearAttempts(key);
  const email = username.toLowerCase();
  let memberships: OrgMembership[] = [];
  try {
    memberships = await listActiveMemberships(email);
  } catch {
    if (isAllowedUsername(email)) {
      memberships = [{
        organizationId: DATABILLITY_ORG_ID,
        name: "DataBillity",
        slug: "databillity",
        role: "owner",
        usesPlatformKey: true,
      }];
    } else {
      return NextResponse.json({ error: "Unable to load your organizations. Try again." }, { status: 503 });
    }
  }

  if (!memberships.length && isAllowedUsername(email)) {
    memberships = [{
      organizationId: DATABILLITY_ORG_ID,
      name: "DataBillity",
      slug: "databillity",
      role: "owner",
      usesPlatformKey: true,
    }];
  }

  if (!memberships.length) {
    return NextResponse.json({ error: "Those credentials don’t match our records." }, { status: 401 });
  }

  const chosen = requestedOrg
    ? memberships.find(item => item.organizationId === requestedOrg)
    : memberships.length === 1 ? memberships[0] : undefined;

  if (requestedOrg && !chosen) {
    return NextResponse.json({ error: "You are not a member of that organization." }, { status: 403 });
  }

  if (!chosen) {
    return NextResponse.json({
      chooseOrganization: true,
      organizations: membershipPayload(memberships),
    });
  }

  const token = await createSessionToken(email, chosen.organizationId);
  const response = NextResponse.json({
    ok: true,
    redirectTo: safeReturnPath(typeof body.from === "string" ? body.from : "/"),
  });
  response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
  return response;
}
