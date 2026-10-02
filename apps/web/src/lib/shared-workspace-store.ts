import { createSql, DATABILLITY_ORG_ID, LEGACY_WORKSPACE_ID } from "@opportunity-engine/db";
import { ensureTenantReady, insertOrganization, uniqueOrganizationSlug } from "@/lib/tenant";
import type { GraphData, Organization, Partner, Pursuit } from "@/lib/mock-data";
import type { Play } from "@opportunity-engine/core";
import type { DiscoveryCandidate } from "@/lib/search-candidates";
import type { LeadImportBatch, SharedWorkspace, WorkspaceState } from "@/lib/shared-workspace";
import { initialWorkspaceForOrganization } from "@/lib/tenant-seed";

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

const EMPTY_GRAPH: GraphData = {
  capabilities: [],
  experience: [],
  credentials: [],
  people: [],
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

function assertOrganizationId(id: string): string {
  const trimmed = id.trim().toLowerCase();
  const resolved = trimmed === LEGACY_WORKSPACE_ID ? DATABILLITY_ORG_ID : trimmed;
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(resolved)) {
    throw new Error("Organization id must be a short lowercase slug.");
  }
  return resolved;
}

/**
 * Missing JSON falls back to empty collections.
 * The demonstration seed is not substituted here: that would copy another
 * organization's sample records into this row and rebuild the seed on every read.
 */
function rowToWorkspace(row: WorkspaceRow): SharedWorkspace {
  const graph = asJson<Partial<GraphData>>(row.graph, EMPTY_GRAPH);
  return {
    organizations: asJson<Organization[]>(row.organizations, []),
    pursuits: asJson<Record<string, Pursuit>>(row.pursuits, {}),
    partners: asJson<Partner[]>(row.partners, []),
    graph: {
      capabilities: graph.capabilities ?? [],
      experience: graph.experience ?? [],
      credentials: graph.credentials ?? [],
      people: graph.people ?? [],
    },
    plays: asJson<Play[]>(row.plays, []),
    leadImports: asJson<LeadImportBatch[]>(row.lead_imports, []),
    discovery: asJson<DiscoveryCandidate[]>(row.discovery, []),
    revision: Number(row.revision) || 1,
  };
}

let workspaceReady: Promise<void> | null = null;

/** Schema changes run once per process. Workspace reads after that are a single primary-key lookup. */
function ensureWorkspaceReady(): Promise<void> {
  if (!workspaceReady) {
    workspaceReady = (async () => {
      await ensureTenantReady();
      const sql = sqlClient();
      if (!sql) return;
      await sql`
        ALTER TABLE shared_workspace
        ADD COLUMN IF NOT EXISTS plays jsonb NOT NULL DEFAULT '[]'::jsonb
      `;
      await sql`
        ALTER TABLE shared_workspace
        ADD COLUMN IF NOT EXISTS lead_imports jsonb NOT NULL DEFAULT '[]'::jsonb
      `;
      await sql`
        ALTER TABLE shared_workspace
        ADD COLUMN IF NOT EXISTS discovery jsonb NOT NULL DEFAULT '[]'::jsonb
      `;
    })().catch((error: unknown) => {
      workspaceReady = null;
      throw error;
    });
  }
  return workspaceReady;
}

async function selectWorkspace(sql: Sql, organizationId: string): Promise<WorkspaceRow[]> {
  return (await sql`
    SELECT organizations, pursuits, partners, graph, plays, lead_imports, discovery, revision
    FROM shared_workspace
    WHERE id = ${organizationId}
    LIMIT 1
  `) as WorkspaceRow[];
}

/** Insert this organization's private workspace. An existing row is left unchanged. */
async function insertWorkspace(sql: Sql, organizationId: string, state: WorkspaceState): Promise<boolean> {
  const inserted = (await sql`
    INSERT INTO shared_workspace (
      id, organizations, pursuits, partners, graph, plays, lead_imports, discovery, revision, updated_at
    )
    VALUES (
      ${organizationId},
      ${JSON.stringify(state.organizations)}::jsonb,
      ${JSON.stringify(state.pursuits)}::jsonb,
      ${JSON.stringify(state.partners)}::jsonb,
      ${JSON.stringify(state.graph)}::jsonb,
      ${JSON.stringify(state.plays ?? [])}::jsonb,
      ${JSON.stringify(state.leadImports ?? [])}::jsonb,
      ${JSON.stringify(state.discovery ?? [])}::jsonb,
      1,
      now()
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `) as { id: string }[];
  return inserted.length > 0;
}

/**
 * Create this organization's workspace.
 * A new organization receives demonstration data. DataBillity does not.
 * Does not read or write any other organization, and does not replace an existing row.
 */
export async function createOrganizationWorkspace(organizationId: string): Promise<void> {
  const sql = sqlClient();
  if (!sql) throw new Error("DATABASE_URL is not set");
  const id = assertOrganizationId(organizationId);
  await ensureWorkspaceReady();
  await insertWorkspace(sql, id, initialWorkspaceForOrganization(id));
}

/**
 * Seed one new organization with its own demonstration workspace.
 * DataBillity, the platform owner, gets an empty workspace if it has none.
 * `operator` is rewritten to that organization id so the legacy env value
 * cannot create a second workspace the session will never read.
 * An existing workspace is left unchanged.
 */
export async function provisionTenant(input: TenantProvision): Promise<{ created: boolean } | null> {
  const sql = sqlClient();
  if (!sql) return null;
  const id = assertOrganizationId(input.id);
  const name = input.name.trim();
  if (!name) throw new Error("Organization name is required.");
  await ensureWorkspaceReady();
  if (id !== DATABILLITY_ORG_ID) {
    const existing = (await sql`
      SELECT id FROM organization WHERE id = ${id} LIMIT 1
    `) as { id: string }[];
    if (!existing.length) {
      const slug = await uniqueOrganizationSlug(name);
      await insertOrganization({ id, name, slug, usesPlatformKey: false });
    }
  }
  const created = await insertWorkspace(sql, id, initialWorkspaceForOrganization(id));
  return { created };
}

export async function readSharedWorkspace(organizationId: string): Promise<SharedWorkspace | null> {
  const sql = sqlClient();
  if (!sql) return null;
  const id = organizationId.trim();
  if (!id) return null;
  await ensureWorkspaceReady();
  const rows = await selectWorkspace(sql, id);
  if (rows[0]) return rowToWorkspace(rows[0]);
  // DataBillity is not created at sign-up. Open an empty workspace, with no demonstration records.
  if (id !== DATABILLITY_ORG_ID) return null;
  await insertWorkspace(sql, id, initialWorkspaceForOrganization(id));
  const seeded = await selectWorkspace(sql, id);
  const row = seeded[0];
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
  const id = organizationId.trim();
  if (!id) return null;
  await ensureWorkspaceReady();

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

  const current = await readSharedWorkspace(id);
  if (!current) return null;
  return { ok: false, conflict: current };
}
