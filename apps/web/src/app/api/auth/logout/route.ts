import { NextResponse } from "next/server";
import { COOKIE_NAME, clearedSessionCookieOptions } from "@/lib/auth";
import { requestIsSameOrigin } from "@/lib/auth-shared";

export const dynamic = "force-dynamic";

function signedOutResponse() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", clearedSessionCookieOptions());
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  return signedOutResponse();
}
