import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, readSessionToken } from "@/lib/auth";
import { requestIsSameOrigin } from "@/lib/auth-shared";
import {
  operatorStoreConfigured,
  readOperatorProfile,
  saveOperatorProfile,
} from "@/lib/operator-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_MAX = 120;
const TITLE_MAX = 120;

export async function GET() {
  const jar = await cookies();
  const session = await readSessionToken(jar.get(COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const profile = await readOperatorProfile(session.email);
  return NextResponse.json(profile);
}

export async function PATCH(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const jar = await cookies();
  const session = await readSessionToken(jar.get(COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  if (!operatorStoreConfigured()) {
    return NextResponse.json({ error: "Profile storage is not configured." }, { status: 503 });
  }

  let body: { displayName?: unknown; title?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!displayName) {
    return NextResponse.json({ error: "Enter the name outreach should sign with." }, { status: 400 });
  }
  if (displayName.length > NAME_MAX) {
    return NextResponse.json({ error: `Name must be ${NAME_MAX} characters or fewer.` }, { status: 400 });
  }
  if (title.length > TITLE_MAX) {
    return NextResponse.json({ error: `Title must be ${TITLE_MAX} characters or fewer.` }, { status: 400 });
  }

  try {
    const profile = await saveOperatorProfile(session.email, displayName, title);
    return NextResponse.json(profile);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to save profile." },
      { status: 500 },
    );
  }
}
