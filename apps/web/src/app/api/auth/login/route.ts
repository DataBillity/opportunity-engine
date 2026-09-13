import { NextResponse } from "next/server";
import {
  COOKIE_NAME,
  authIsConfigured,
  createSessionToken,
  credentialsMatch,
  getExpectedCredentials,
  sessionCookieOptions,
} from "@/lib/auth";
import { requestIsSameOrigin, safeReturnPath } from "@/lib/auth-shared";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

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

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  if (!authIsConfigured()) {
    return NextResponse.json(
      { error: "Sign-in is not configured. Set AUTH_USERNAME, AUTH_PASSWORD, and AUTH_SECRET." },
      { status: 503 },
    );
  }

  const key = clientKey(request);
  if (tooManyAttempts(key)) {
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

  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password || !credentialsMatch(username, password)) {
    return NextResponse.json({ error: "Those credentials don’t match our records." }, { status: 401 });
  }

  attempts.delete(key);
  const email = getExpectedCredentials().username;
  const token = await createSessionToken(email);
  const response = NextResponse.json({ ok: true, redirectTo: safeReturnPath(typeof body.from === "string" ? body.from : "/") });
  response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
  return response;
}
