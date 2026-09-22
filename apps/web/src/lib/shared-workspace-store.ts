import { createSql } from "@opportunity-engine/db";
import {
  graphData,
  organizations,
  partnerDirectory,
  pursuits,
  type GraphData,
  type Organization,
  type Partner,
  type Pursuit,
} from "@/lib/mock-data";
import type { SharedWorkspace, WorkspaceState } from "@/lib/shared-workspace";

const WORKSPACE_ID = "operator";

type Sql = ReturnType<typeof createSql>;

type WorkspaceRow = {
  organizations: unknown;
  pursuits: unknown;
  partners: unknown;
  graph: unknown;
  revision: number;
};

function sqlClient(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return createSql(url);
}

function asJson<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  if (value == null) return fallback;
  return value as T;
}

function seedState(): WorkspaceState {
  return {
    organizations: organizations,
    pursuits: pursuits,
    partners: partnerDirectory,
    graph: graphData,
  };
}

function rowToWorkspace(row: WorkspaceRow): SharedWorkspace {
  const seed = seedState();
  const graph = asJson<Partial<GraphData>>(row.graph, seed.graph);
  return {
    organizations: asJson<Organization[]>(row.organizations, seed.organizations),
    pursuits: asJson<Record<string, Pursuit>>(row.pursuits, seed.pursuits),
    partners: asJson<Partner[]>(row.partners, seed.partners),
    graph: {
      capabilities: graph.capabilities ?? seed.graph.capabilities,
      experience: graph.experience ?? seed.graph.experience,
      credentials: graph.credentials ?? seed.graph.credentials,
      people: graph.people ?? seed.graph.people,
    },
    revision: Number(row.revision) || 1,
  };
}

async function ensureTable(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS shared_workspace (
      id text PRIMARY KEY,
      organizations jsonb NOT NULL,
      pursuits jsonb NOT NULL,
      partners jsonb NOT NULL,
      graph jsonb NOT NULL,
      revision integer NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

export async function readSharedWorkspace(): Promise<SharedWorkspace | null> {
  const sql = sqlClient();
  if (!sql) return null;
  await ensureTable(sql);
  const seed = seedState();
  await sql`
    INSERT INTO shared_workspace (id, organizations, pursuits, partners, graph, revision, updated_at)
    VALUES (
      ${WORKSPACE_ID},
      ${JSON.stringify(seed.organizations)}::jsonb,
      ${JSON.stringify(seed.pursuits)}::jsonb,
      ${JSON.stringify(seed.partners)}::jsonb,
      ${JSON.stringify(seed.graph)}::jsonb,
      1,
      now()
    )
    ON CONFLICT (id) DO NOTHING
  `;
  const rows = (await sql`
    SELECT organizations, pursuits, partners, graph, revision
    FROM shared_workspace
    WHERE id = ${WORKSPACE_ID}
    LIMIT 1
  `) as WorkspaceRow[];
  const row = rows[0];
  if (!row) return null;
  return rowToWorkspace(row);
}

export async function writeSharedWorkspace(
  next: WorkspaceState,
  expectedRevision: number,
): Promise<{ ok: true; workspace: SharedWorkspace } | { ok: false; conflict: SharedWorkspace } | null> {
  const sql = sqlClient();
  if (!sql) return null;
  await ensureTable(sql);

  const updated = (await sql`
    UPDATE shared_workspace
    SET
      organizations = ${JSON.stringify(next.organizations)}::jsonb,
      pursuits = ${JSON.stringify(next.pursuits)}::jsonb,
      partners = ${JSON.stringify(next.partners)}::jsonb,
      graph = ${JSON.stringify(next.graph)}::jsonb,
      revision = revision + 1,
      updated_at = now()
    WHERE id = ${WORKSPACE_ID} AND revision = ${expectedRevision}
    RETURNING organizations, pursuits, partners, graph, revision
  `) as WorkspaceRow[];

  if (updated[0]) return { ok: true, workspace: rowToWorkspace(updated[0]) };

  const current = await readSharedWorkspace();
  if (!current) return null;
  return { ok: false, conflict: current };
}
