import { createSql, DATABILLITY_ORG_ID, LEGACY_WORKSPACE_ID } from "@opportunity-engine/db";
import { getExpectedUsernames } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import { randomToken, sha256Base64Url } from "@/lib/password";

type Sql = ReturnType<typeof createSql>;

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type OrgRole = "owner" | "member";

export type OrgMembership = {
  organizationId: string;
  name: string;
  slug: string;
  role: OrgRole;
  usesPlatformKey: boolean;
};

export type OrgMemberRow = {
  email: string;
  role: OrgRole;
  status: "active" | "invited";
  invitedAt: string | null;
  acceptedAt: string | null;
};

function getSql(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return createSql(url);
}

function requireSql(): Sql {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not set");
  return sql;
}

let ready: Promise<void> | null = null;

export function ensureTenantReady(): Promise<void> {
  if (!ready) {
    ready = ensureTenantSchema().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

async function ensureTenantSchema(): Promise<void> {
  const sql = requireSql();
  await sql`
    CREATE TABLE IF NOT EXISTS organization (
      id text PRIMARY KEY,
      name text NOT NULL,
      slug text NOT NULL UNIQUE,
      uses_platform_key boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS organization_member (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      email text NOT NULL,
      role text NOT NULL,
      status text NOT NULL,
      invite_token_hash text,
      invite_expires_at timestamptz,
      invited_at timestamptz,
      accepted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, email)
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS organization_member_invite_token_idx
    ON organization_member (invite_token_hash)
    WHERE invite_token_hash IS NOT NULL
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS organization_secret (
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      kind text NOT NULL,
      ciphertext text NOT NULL,
      key_version integer NOT NULL DEFAULT 1,
      last_four text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (organization_id, kind)
    )
  `;
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
  await sql`
    UPDATE shared_workspace
    SET id = ${DATABILLITY_ORG_ID}
    WHERE id = ${LEGACY_WORKSPACE_ID}
      AND NOT EXISTS (SELECT 1 FROM shared_workspace WHERE id = ${DATABILLITY_ORG_ID})
  `;

  await sql`
    INSERT INTO organization (id, name, slug, uses_platform_key)
    VALUES (${DATABILLITY_ORG_ID}, 'DataBillity', 'databillity', true)
    ON CONFLICT (id) DO NOTHING
  `;

  for (const email of getExpectedUsernames()) {
    await sql`
      INSERT INTO organization_member (
        organization_id, email, role, status, accepted_at
      ) VALUES (
        ${DATABILLITY_ORG_ID}, ${email}, 'owner', 'active', now()
      )
      ON CONFLICT (organization_id, email) DO NOTHING
    `;
  }

  const identityTables = ["account", "lead", "contact", "source_batch", "score_run"] as const;
  for (const table of identityTables) {
    const present = (await sql`
      SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS present
    `) as { present: boolean }[];
    if (!present[0]?.present) continue;
    if (table === "account") {
      await sql`ALTER TABLE account ADD COLUMN IF NOT EXISTS organization_id text`;
      await sql`UPDATE account SET organization_id = ${DATABILLITY_ORG_ID} WHERE organization_id IS NULL`;
    } else if (table === "lead") {
      await sql`ALTER TABLE lead ADD COLUMN IF NOT EXISTS organization_id text`;
      await sql`UPDATE lead SET organization_id = ${DATABILLITY_ORG_ID} WHERE organization_id IS NULL`;
    } else if (table === "contact") {
      await sql`ALTER TABLE contact ADD COLUMN IF NOT EXISTS organization_id text`;
      await sql`UPDATE contact SET organization_id = ${DATABILLITY_ORG_ID} WHERE organization_id IS NULL`;
    } else if (table === "source_batch") {
      await sql`ALTER TABLE source_batch ADD COLUMN IF NOT EXISTS organization_id text`;
      await sql`UPDATE source_batch SET organization_id = ${DATABILLITY_ORG_ID} WHERE organization_id IS NULL`;
    } else {
      await sql`ALTER TABLE score_run ADD COLUMN IF NOT EXISTS organization_id text`;
      await sql`UPDATE score_run SET organization_id = ${DATABILLITY_ORG_ID} WHERE organization_id IS NULL`;
    }
  }
}

function asRole(value: string): OrgRole {
  return value === "owner" ? "owner" : "member";
}

export async function listActiveMemberships(email: string): Promise<OrgMembership[]> {
  await ensureTenantReady();
  const sql = requireSql();
  const normalized = email.trim().toLowerCase();
  const rows = (await sql`
    SELECT m.organization_id, m.role, o.name, o.slug, o.uses_platform_key
    FROM organization_member m
    JOIN organization o ON o.id = m.organization_id
    WHERE m.email = ${normalized} AND m.status = 'active'
    ORDER BY o.name ASC
  `) as {
    organization_id: string;
    role: string;
    name: string;
    slug: string;
    uses_platform_key: boolean;
  }[];
  return rows.map(row => ({
    organizationId: row.organization_id,
    name: row.name,
    slug: row.slug,
    role: asRole(row.role),
    usesPlatformKey: Boolean(row.uses_platform_key),
  }));
}

export async function primaryOrganizationId(email: string): Promise<string | null> {
  const memberships = await listActiveMemberships(email);
  const databillity = memberships.find(item => item.organizationId === DATABILLITY_ORG_ID);
  return databillity?.organizationId ?? memberships[0]?.organizationId ?? null;
}

export async function readMembership(organizationId: string, email: string): Promise<OrgMembership | null> {
  const memberships = await listActiveMemberships(email);
  return memberships.find(item => item.organizationId === organizationId) ?? null;
}

export async function emailHasAnyMembership(email: string): Promise<boolean> {
  await ensureTenantReady();
  const sql = requireSql();
  const rows = (await sql`
    SELECT 1 AS found
    FROM organization_member
    WHERE email = ${email.trim().toLowerCase()}
    LIMIT 1
  `) as { found: number }[];
  return rows.length > 0;
}

export function slugifyOrganizationName(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return base || "org";
}

export async function uniqueOrganizationSlug(name: string): Promise<string> {
  await ensureTenantReady();
  const sql = requireSql();
  const base = slugifyOrganizationName(name);
  let slug = base;
  for (let attempt = 0; attempt < 6; attempt++) {
    const rows = (await sql`
      SELECT id FROM organization WHERE slug = ${slug} LIMIT 1
    `) as { id: string }[];
    if (!rows.length) return slug;
    const suffix = randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || String(attempt);
    slug = `${base}-${suffix}`.slice(0, 48);
  }
  throw new Error("Choose a different organization name.");
}

export async function insertOrganization(input: {
  id: string;
  name: string;
  slug: string;
  usesPlatformKey: boolean;
}): Promise<void> {
  await ensureTenantReady();
  const sql = requireSql();
  await sql`
    INSERT INTO organization (id, name, slug, uses_platform_key)
    VALUES (${input.id}, ${input.name}, ${input.slug}, ${input.usesPlatformKey})
  `;
}

export async function deleteOrganization(organizationId: string): Promise<void> {
  const sql = getSql();
  if (!sql || organizationId === DATABILLITY_ORG_ID) return;
  await sql`DELETE FROM shared_workspace WHERE id = ${organizationId}`;
  await sql`DELETE FROM organization WHERE id = ${organizationId}`;
}

export async function addActiveMember(input: {
  organizationId: string;
  email: string;
  role: OrgRole;
}): Promise<void> {
  await ensureTenantReady();
  const sql = requireSql();
  const email = input.email.trim().toLowerCase();
  await sql`
    INSERT INTO organization_member (
      organization_id, email, role, status, accepted_at
    ) VALUES (
      ${input.organizationId}, ${email}, ${input.role}, 'active', now()
    )
  `;
}

export async function listMembers(organizationId: string): Promise<OrgMemberRow[]> {
  await ensureTenantReady();
  const sql = requireSql();
  const rows = (await sql`
    SELECT email, role, status, invited_at, accepted_at
    FROM organization_member
    WHERE organization_id = ${organizationId}
    ORDER BY
      CASE WHEN role = 'owner' THEN 0 ELSE 1 END,
      email ASC
  `) as {
    email: string;
    role: string;
    status: string;
    invited_at: string | null;
    accepted_at: string | null;
  }[];
  return rows.map(row => ({
    email: row.email,
    role: asRole(row.role),
    status: row.status === "invited" ? "invited" : "active",
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
  }));
}

export async function inviteMember(organizationId: string, email: string): Promise<{ token: string }> {
  await ensureTenantReady();
  const sql = requireSql();
  const normalized = email.trim().toLowerCase();
  const existing = (await sql`
    SELECT status FROM organization_member
    WHERE organization_id = ${organizationId} AND email = ${normalized}
    LIMIT 1
  `) as { status: string }[];
  if (existing[0]?.status === "active") {
    throw new Error("That person is already on this team.");
  }
  const token = randomToken();
  const tokenHash = await sha256Base64Url(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  if (existing[0]) {
    await sql`
      UPDATE organization_member
      SET
        role = 'member',
        status = 'invited',
        invite_token_hash = ${tokenHash},
        invite_expires_at = ${expiresAt},
        invited_at = now(),
        updated_at = now()
      WHERE organization_id = ${organizationId} AND email = ${normalized}
    `;
  } else {
    await sql`
      INSERT INTO organization_member (
        organization_id, email, role, status, invite_token_hash, invite_expires_at, invited_at
      ) VALUES (
        ${organizationId}, ${normalized}, 'member', 'invited', ${tokenHash}, ${expiresAt}, now()
      )
    `;
  }
  return { token };
}

export async function readInvite(token: string): Promise<{ email: string; organizationId: string; organizationName: string } | null> {
  await ensureTenantReady();
  const sql = requireSql();
  if (!token) return null;
  const tokenHash = await sha256Base64Url(token);
  const rows = (await sql`
    SELECT m.email, m.organization_id, m.invite_expires_at, o.name
    FROM organization_member m
    JOIN organization o ON o.id = m.organization_id
    WHERE m.invite_token_hash = ${tokenHash}
      AND m.status = 'invited'
    LIMIT 1
  `) as { email: string; organization_id: string; invite_expires_at: string; name: string }[];
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.invite_expires_at).getTime() < Date.now()) return null;
  return { email: row.email, organizationId: row.organization_id, organizationName: row.name };
}

export async function acceptInvite(token: string): Promise<{ email: string; organizationId: string } | null> {
  await ensureTenantReady();
  const sql = requireSql();
  if (!token) return null;
  const tokenHash = await sha256Base64Url(token);
  const claimed = (await sql`
    UPDATE organization_member
    SET
      status = 'active',
      invite_token_hash = NULL,
      invite_expires_at = NULL,
      accepted_at = now(),
      updated_at = now()
    WHERE invite_token_hash = ${tokenHash}
      AND status = 'invited'
      AND invite_expires_at > now()
    RETURNING email, organization_id
  `) as { email: string; organization_id: string }[];
  const row = claimed[0];
  if (!row) return null;
  return { email: row.email, organizationId: row.organization_id };
}

export async function removeMember(organizationId: string, actorEmail: string, targetEmail: string): Promise<void> {
  await ensureTenantReady();
  const sql = requireSql();
  const actor = actorEmail.trim().toLowerCase();
  const target = targetEmail.trim().toLowerCase();
  if (actor === target) throw new Error("You cannot remove yourself.");
  const owners = (await sql`
    SELECT email FROM organization_member
    WHERE organization_id = ${organizationId} AND role = 'owner' AND status = 'active'
  `) as { email: string }[];
  const targetRows = (await sql`
    SELECT role FROM organization_member
    WHERE organization_id = ${organizationId} AND email = ${target}
    LIMIT 1
  `) as { role: string }[];
  if (!targetRows[0]) throw new Error("That person is not on this team.");
  if (targetRows[0].role === "owner" && owners.length <= 1) {
    throw new Error("This organization needs at least one owner.");
  }
  await sql`
    DELETE FROM organization_member
    WHERE organization_id = ${organizationId} AND email = ${target}
  `;
}

export async function readOrganization(organizationId: string): Promise<{
  id: string;
  name: string;
  usesPlatformKey: boolean;
} | null> {
  await ensureTenantReady();
  const sql = requireSql();
  const rows = (await sql`
    SELECT id, name, uses_platform_key
    FROM organization
    WHERE id = ${organizationId}
    LIMIT 1
  `) as { id: string; name: string; uses_platform_key: boolean }[];
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, name: row.name, usesPlatformKey: Boolean(row.uses_platform_key) };
}

export async function writeAnthropicSecret(organizationId: string, apiKey: string): Promise<{ lastFour: string }> {
  await ensureTenantReady();
  const sql = requireSql();
  const trimmed = apiKey.trim();
  const stored = await encryptSecret(trimmed);
  const tail = trimmed.slice(-4);
  await sql`
    INSERT INTO organization_secret (organization_id, kind, ciphertext, key_version, last_four, updated_at)
    VALUES (${organizationId}, 'anthropic', ${stored.ciphertext}, ${stored.keyVersion}, ${tail}, now())
    ON CONFLICT (organization_id, kind) DO UPDATE SET
      ciphertext = excluded.ciphertext,
      key_version = excluded.key_version,
      last_four = excluded.last_four,
      updated_at = now()
  `;
  return { lastFour: tail };
}

export async function readAnthropicSecret(organizationId: string): Promise<{ apiKey: string; lastFour: string } | null> {
  await ensureTenantReady();
  const sql = requireSql();
  const rows = (await sql`
    SELECT ciphertext, key_version, last_four
    FROM organization_secret
    WHERE organization_id = ${organizationId} AND kind = 'anthropic'
    LIMIT 1
  `) as { ciphertext: string; key_version: number; last_four: string }[];
  const row = rows[0];
  if (!row) return null;
  const apiKey = await decryptSecret(row.ciphertext, row.key_version);
  return { apiKey, lastFour: row.last_four };
}

export type AnthropicKeyStatus = {
  configured: boolean;
  lastFour: string | null;
  usesPlatformKey: boolean;
  source: "customer" | "platform" | "missing";
};

export async function describeAnthropicKey(organizationId: string): Promise<AnthropicKeyStatus> {
  const org = await readOrganization(organizationId);
  const usesPlatformKey = Boolean(org?.usesPlatformKey);
  const sql = requireSql();
  const rows = (await sql`
    SELECT last_four FROM organization_secret
    WHERE organization_id = ${organizationId} AND kind = 'anthropic'
    LIMIT 1
  `) as { last_four: string }[];
  if (rows[0]) {
    return {
      configured: true,
      lastFour: rows[0].last_four,
      usesPlatformKey,
      source: "customer",
    };
  }
  const platformKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (usesPlatformKey && platformKey) {
    return { configured: true, lastFour: null, usesPlatformKey, source: "platform" };
  }
  return { configured: false, lastFour: null, usesPlatformKey, source: "missing" };
}
