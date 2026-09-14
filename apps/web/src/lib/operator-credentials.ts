import { createSql } from "@opportunity-engine/db";
import { credentialsMatch, getExpectedUsernames, isAllowedUsername } from "@/lib/auth";
import { hashPassword, randomToken, RESET_TOKEN_TTL_MS, sha256Base64Url, verifyPassword } from "@/lib/password";

type Sql = ReturnType<typeof createSql>;

function getSql(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return createSql(url);
}

export function operatorStoreConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function verifyLoginCredentials(username: string, password: string): Promise<boolean> {
  const email = username.trim().toLowerCase();
  if (!email || !password || !isAllowedUsername(email)) return false;

  try {
    const sql = getSql();
    if (sql) {
      const rows = (await sql`
        SELECT password_hash
        FROM operator_credential
        WHERE email = ${email}
        LIMIT 1
      `) as { password_hash: string }[];
      const stored = rows[0]?.password_hash;
      if (stored) return verifyPassword(password, stored);
    }
  } catch {
    // If Neon is unreachable, fall back to the shared env password so operators are not locked out.
  }

  return credentialsMatch(username, password);
}

export async function issuePasswordResetToken(email: string): Promise<{ token: string; expiresAt: Date } | null> {
  const sql = getSql();
  if (!sql) return null;
  const normalized = email.trim().toLowerCase();
  const token = randomToken();
  const tokenHash = await sha256Base64Url(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await sql`
    UPDATE password_reset_token
    SET used_at = now()
    WHERE email = ${normalized} AND used_at IS NULL
  `;
  await sql`
    INSERT INTO password_reset_token (email, token_hash, expires_at)
    VALUES (${normalized}, ${tokenHash}, ${expiresAt.toISOString()})
  `;

  return { token, expiresAt };
}

export async function readPasswordResetToken(token: string): Promise<{ email: string } | null> {
  const sql = getSql();
  if (!sql || !token) return null;
  const tokenHash = await sha256Base64Url(token);
  const rows = (await sql`
    SELECT email, expires_at, used_at
    FROM password_reset_token
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `) as { email: string; expires_at: string; used_at: string | null }[];
  const row = rows[0];
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  if (!getExpectedUsernames().includes(row.email)) return null;
  return { email: row.email };
}

export async function consumePasswordResetToken(token: string, password: string): Promise<{ email: string } | null> {
  const sql = getSql();
  if (!sql || !token) return null;
  const tokenHash = await sha256Base64Url(token);
  const claimed = (await sql`
    UPDATE password_reset_token
    SET used_at = now()
    WHERE token_hash = ${tokenHash}
      AND used_at IS NULL
      AND expires_at > now()
    RETURNING email
  `) as { email: string }[];
  const email = claimed[0]?.email;
  if (!email || !isAllowedUsername(email)) return null;

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  await sql`
    INSERT INTO operator_credential (email, password_hash, password_updated_at, created_at, updated_at)
    VALUES (${email}, ${passwordHash}, ${now}, ${now}, ${now})
    ON CONFLICT (email) DO UPDATE SET
      password_hash = excluded.password_hash,
      password_updated_at = excluded.password_updated_at,
      updated_at = excluded.updated_at
  `;
  return { email };
}
