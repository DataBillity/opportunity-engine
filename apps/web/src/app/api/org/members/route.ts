import { NextResponse } from "next/server";
import { requestIsSameOrigin } from "@/lib/auth-shared";
import { readOrganization, listMembers, removeMember } from "@/lib/tenant";
import { resolveModelAccess } from "@/lib/org-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const resolved = await resolveModelAccess();
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const org = await readOrganization(resolved.access.session.organizationId);
  const members = await listMembers(resolved.access.session.organizationId);
  return NextResponse.json({
    organizationId: resolved.access.session.organizationId,
    organizationName: org?.name ?? resolved.access.membership.name,
    role: resolved.access.membership.role,
    members,
  });
}

export async function DELETE(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const resolved = await resolveModelAccess();
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (resolved.access.membership.role !== "owner") {
    return NextResponse.json({ error: "Only an owner can remove teammates." }, { status: 403 });
  }
  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase() ?? "";
  if (!email) return NextResponse.json({ error: "Choose a teammate to remove." }, { status: 400 });
  try {
    await removeMember(resolved.access.session.organizationId, resolved.access.session.email, email);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove that teammate.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
