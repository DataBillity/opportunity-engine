import { NextResponse } from "next/server";
import {
  COOKIE_NAME,
  authIsConfigured,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth";
import { requestIsSameOrigin, safeReturnPath } from "@/lib/auth-shared";
import { clientKey, clearAttempts, tooManyAttempts } from "@/lib/auth-rate-limit";
import { verifyLoginCredentials } from "@/lib/operator-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let body: { username?: unknown; password?: unknown; from?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password || !(await verifyLoginCredentials(username, password))) {
    return NextResponse.json({ error: "Those credentials don’t match our records." }, { status: 401 });
  }

  clearAttempts(key);
  const email = username.toLowerCase();
  const token = await createSessionToken(email);
  const response = NextResponse.json({ ok: true, redirectTo: safeReturnPath(typeof body.from === "string" ? body.from : "/") });
  response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
  return response;
}
