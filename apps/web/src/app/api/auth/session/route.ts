import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, readSessionToken } from "@/lib/auth";
import { readOperatorProfile } from "@/lib/operator-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jar = await cookies();
  const session = await readSessionToken(jar.get(COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const profile = await readOperatorProfile(session.email);
  return NextResponse.json({
    authenticated: true,
    email: session.email,
    displayName: profile.displayName,
    title: profile.title,
  });
}
