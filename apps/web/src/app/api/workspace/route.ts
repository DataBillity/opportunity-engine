import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, readSessionToken } from "@/lib/auth";
import { requestIsSameOrigin } from "@/lib/auth-shared";
import type { GraphData, Organization, Partner, Pursuit } from "@/lib/mock-data";
import { readSharedWorkspace, writeSharedWorkspace } from "@/lib/shared-workspace-store";
import type { WorkspaceState } from "@/lib/shared-workspace";

type WorkspacePut = WorkspaceState & { revision: number };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireSession() {
  const jar = await cookies();
  return readSessionToken(jar.get(COOKIE_NAME)?.value);
}

function isWorkspacePut(value: unknown): value is WorkspacePut {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<WorkspacePut>;
  const graph = body.graph as Partial<GraphData> | undefined;
  return Array.isArray(body.organizations)
    && !!body.pursuits && typeof body.pursuits === "object" && !Array.isArray(body.pursuits)
    && Array.isArray(body.partners)
    && !!graph
    && Array.isArray(graph.capabilities)
    && Array.isArray(graph.experience)
    && Array.isArray(graph.credentials)
    && Array.isArray(graph.people)
    && typeof body.revision === "number"
    && Number.isInteger(body.revision);
}

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  try {
    const workspace = await readSharedWorkspace();
    if (!workspace) {
      return NextResponse.json({ error: "Shared workspace storage is not configured." }, { status: 503 });
    }
    return NextResponse.json(workspace);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load the shared workspace.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!isWorkspacePut(body)) {
    return NextResponse.json({ error: "Workspace payload is invalid." }, { status: 400 });
  }

  const next: WorkspaceState = {
    organizations: body.organizations as Organization[],
    pursuits: body.pursuits as Record<string, Pursuit>,
    partners: body.partners as Partner[],
    graph: body.graph as GraphData,
  };

  try {
    const result = await writeSharedWorkspace(next, body.revision);
    if (!result) {
      return NextResponse.json({ error: "Shared workspace storage is not configured." }, { status: 503 });
    }
    if (!result.ok) {
      return NextResponse.json(result.conflict, { status: 409 });
    }
    return NextResponse.json(result.workspace);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save the shared workspace.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
