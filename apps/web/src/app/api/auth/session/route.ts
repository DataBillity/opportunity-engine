import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, readSessionToken } from "@/lib/auth";

export async function GET() {
  const jar = await cookies();
  const session = await readSessionToken(jar.get(COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, email: session.email });
}
