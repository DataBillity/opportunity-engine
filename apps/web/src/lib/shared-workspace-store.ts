import { createSql, DATABILLITY_ORG_ID } from "@opportunity-engine/db";
import { ensureTenantReady } from "@/lib/tenant";
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
import type { Play } from "@opportunity-engine/core";
import type { SharedWorkspace, WorkspaceState } from "@/lib/shared-workspace";

type Sql = ReturnType<typeof createSql>;

type WorkspaceRow = {
  organizations: unknown;
  pursuits: unknown;
  partners: unknown;
  graph: unknown;
  plays?: unknown;
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
    plays: [],
  };
}

function emptyState(): WorkspaceState {
  return {
    organizations: [],
    pursuits: {},
    partners: [],
    graph: {
      capabilities: [],
      experience: [],
      credentials: [],
      people: [],
    },
    plays: [],
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
    plays: asJson<Play[]>(row.plays, []),
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
  await sql`
    ALTER TABLE shared_workspace
    ADD COLUMN IF NOT EXISTS plays jsonb NOT NULL DEFAULT '[]'::jsonb
  `;
}

async function insertWorkspace(sql: Sql, organizationId: string, state: WorkspaceState): Promise<void> {
  await sql`
    INSERT INTO shared_workspace (id, organizations, pursuits, partners, graph, plays, revision, updated_at)
    VALUES (
      ${organizationId},
      ${JSON.stringify(state.organizations)}::jsonb,
      ${JSON.stringify(state.pursuits)}::jsonb,
      ${JSON.stringify(state.partners)}::jsonb,
      ${JSON.stringify(state.graph)}::jsonb,
      ${JSON.stringify(state.plays ?? [])}::jsonb,
      1,
      now()
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

/** Empty pipeline, partners, graph, and plays. Used for organizations created at signup. */
export async function createOrganizationWorkspace(organizationId: string): Promise<void> {
  const sql = sqlClient();
  if (!sql) throw new Error("DATABASE_URL is not set");
  await ensureTenantReady();
  await ensureTable(sql);
  await insertWorkspace(sql, organizationId, emptyState());
}

export async function readSharedWorkspace(organizationId: string): Promise<SharedWorkspace | null> {
  const sql = sqlClient();
  if (!sql) return null;
  await ensureTenantReady();
  await ensureTable(sql);
  if (organizationId === DATABILLITY_ORG_ID) {
    await insertWorkspace(sql, organizationId, seedState());
  }
  const rows = (await sql`
    SELECT organizations, pursuits, partners, graph, plays, revision
    FROM shared_workspace
    WHERE id = ${organizationId}
    LIMIT 1
  `) as WorkspaceRow[];
  const row = rows[0];
  if (!row) return null;
  return rowToWorkspace(row);
}

export async function writeSharedWorkspace(
  organizationId: string,
  next: WorkspaceState,
  expectedRevision: number,
): Promise<{ ok: true; workspace: SharedWorkspace } | { ok: false; conflict: SharedWorkspace } | null> {
  const sql = sqlClient();
  if (!sql) return null;
  await ensureTenantReady();
  await ensureTable(sql);

  const updated = (await sql`
    UPDATE shared_workspace
    SET
      organizations = ${JSON.stringify(next.organizations)}::jsonb,
      pursuits = ${JSON.stringify(next.pursuits)}::jsonb,
      partners = ${JSON.stringify(next.partners)}::jsonb,
      graph = ${JSON.stringify(next.graph)}::jsonb,
      plays = ${JSON.stringify(next.plays ?? [])}::jsonb,
      revision = revision + 1,
      updated_at = now()
    WHERE id = ${organizationId} AND revision = ${expectedRevision}
    RETURNING organizations, pursuits, partners, graph, plays, revision
  `) as WorkspaceRow[];

  if (updated[0]) return { ok: true, workspace: rowToWorkspace(updated[0]) };

  const current = await readSharedWorkspace(organizationId);
  if (!current) return null;
  return { ok: false, conflict: current };
}
