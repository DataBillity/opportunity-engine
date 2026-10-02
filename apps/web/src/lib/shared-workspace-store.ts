import { createSql } from "@opportunity-engine/db";
import {
  type GraphData,
  type Organization,
  type Partner,
  type Pursuit,
} from "@/lib/mock-data";
import type { DiscoveryCandidate } from "@/lib/search-candidates";
import type { LeadImportBatch, SharedWorkspace, WorkspaceState } from "@/lib/shared-workspace";
import type { Play } from "@opportunity-engine/core";
import { buildTenantSeed } from "@/lib/tenant-seed";

function workspaceId(): string {
  const configured = (process.env.TENANT_ID ?? "operator").trim().toLowerCase();
  return configured || "operator";
}

function tenantName(id: string): string {
  const configured = (process.env.TENANT_NAME ?? "").trim();
  if (configured) return configured;
  return id === "operator" ? "DataBillity" : id;
}

type Sql = ReturnType<typeof createSql>;

type WorkspaceRow = {
  organizations: unknown;
  pursuits: unknown;
  partners: unknown;
  graph: unknown;
  plays: unknown;
  lead_imports: unknown;
  discovery: unknown;
  revision: number;
};

export type TenantProvision = {
  id: string;
  name: string;
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
  return buildTenantSeed();
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
    leadImports: asJson<LeadImportBatch[]>(row.lead_imports, []),
    discovery: asJson<DiscoveryCandidate[]>(row.discovery, []),
    revision: Number(row.revision) || 1,
  };
}

async function ensureTable(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS tenant (
      id text PRIMARY KEY,
      name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS shared_workspace (
      id text PRIMARY KEY,
      organizations jsonb NOT NULL,
      pursuits jsonb NOT NULL,
      partners jsonb NOT NULL,
      graph jsonb NOT NULL,
      plays jsonb NOT NULL DEFAULT '[]'::jsonb,
      lead_imports jsonb NOT NULL DEFAULT '[]'::jsonb,
      discovery jsonb NOT NULL DEFAULT '[]'::jsonb,
      revision integer NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE shared_workspace ADD COLUMN IF NOT EXISTS plays jsonb NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE shared_workspace ADD COLUMN IF NOT EXISTS lead_imports jsonb NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE shared_workspace ADD COLUMN IF NOT EXISTS discovery jsonb NOT NULL DEFAULT '[]'::jsonb`;
}

function assertTenantId(id: string): string {
  const trimmed = id.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(trimmed)) {
    throw new Error("Tenant id must be a short lowercase slug.");
  }
  return trimmed;
}

/** Insert a tenant and its demonstration workspace. An existing workspace is left unchanged. */
export async function provisionTenant(input: TenantProvision): Promise<{ created: boolean } | null> {
  const sql = sqlClient();
  if (!sql) return null;
  await ensureTable(sql);
  const id = assertTenantId(input.id);
  const name = input.name.trim();
  if (!name) throw new Error("Tenant name is required.");
  const seed = seedState();
  await sql`
    INSERT INTO tenant (id, name, created_at)
    VALUES (${id}, ${name}, now())
    ON CONFLICT (id) DO NOTHING
  `;
  const inserted = (await sql`
    INSERT INTO shared_workspace (
      id, organizations, pursuits, partners, graph, plays, lead_imports, discovery, revision, updated_at
    )
    VALUES (
      ${id},
      ${JSON.stringify(seed.organizations)}::jsonb,
      ${JSON.stringify(seed.pursuits)}::jsonb,
      ${JSON.stringify(seed.partners)}::jsonb,
      ${JSON.stringify(seed.graph)}::jsonb,
      ${JSON.stringify(seed.plays ?? [])}::jsonb,
      ${JSON.stringify(seed.leadImports ?? [])}::jsonb,
      ${JSON.stringify(seed.discovery ?? [])}::jsonb,
      1,
      now()
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `) as { id: string }[];
  return { created: inserted.length > 0 };
}

export async function readSharedWorkspace(): Promise<SharedWorkspace | null> {
  const sql = sqlClient();
  if (!sql) return null;
  const id = workspaceId();
  const provisioned = await provisionTenant({ id, name: tenantName(id) });
  if (!provisioned) return null;
  const rows = (await sql`
    SELECT organizations, pursuits, partners, graph, plays, lead_imports, discovery, revision
    FROM shared_workspace
    WHERE id = ${id}
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

  const id = workspaceId();
  const updated = (await sql`
    UPDATE shared_workspace
    SET
      organizations = ${JSON.stringify(next.organizations)}::jsonb,
      pursuits = ${JSON.stringify(next.pursuits)}::jsonb,
      partners = ${JSON.stringify(next.partners)}::jsonb,
      graph = ${JSON.stringify(next.graph)}::jsonb,
      plays = ${JSON.stringify(next.plays ?? [])}::jsonb,
      lead_imports = ${JSON.stringify(next.leadImports ?? [])}::jsonb,
      discovery = ${JSON.stringify(next.discovery ?? [])}::jsonb,
      revision = revision + 1,
      updated_at = now()
    WHERE id = ${id} AND revision = ${expectedRevision}
    RETURNING organizations, pursuits, partners, graph, plays, lead_imports, discovery, revision
  `) as WorkspaceRow[];

  if (updated[0]) return { ok: true, workspace: rowToWorkspace(updated[0]) };

  const current = await readSharedWorkspace();
  if (!current) return null;
  return { ok: false, conflict: current };
}
