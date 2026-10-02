import { cookies } from "next/headers";
import { describeMissingKeys } from "@opportunity-engine/ai";
import { COOKIE_NAME, readSessionToken, type Session } from "@/lib/auth";
import { readAnthropicSecret, readMembership, readOrganization, type OrgMembership } from "@/lib/tenant";

export const CUSTOMER_KEY_MISSING = "Add your Claude API key in API & Integrations. This organization uses its own key.";

export async function readRequestSession(): Promise<Session | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(COOKIE_NAME)?.value);
}

export type ModelAccess = {
  session: Session;
  membership: OrgMembership;
  apiKey: string | null;
  usesPlatformKey: boolean;
  missingMessage: string;
};

export async function resolveModelAccess(): Promise<
  | { ok: true; access: ModelAccess }
  | { ok: false; status: number; error: string }
> {
  const session = await readRequestSession();
  if (!session) return { ok: false, status: 401, error: "Sign in required." };
  const membership = await readMembership(session.organizationId, session.email);
  if (!membership) return { ok: false, status: 403, error: "You are not a member of this organization." };
  const org = await readOrganization(session.organizationId);
  const usesPlatformKey = Boolean(org?.usesPlatformKey);
  const stored = await readAnthropicSecret(session.organizationId);
  const platformKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  const apiKey = stored?.apiKey ?? (usesPlatformKey ? platformKey || null : null);
  return {
    ok: true,
    access: {
      session,
      membership,
      apiKey,
      usesPlatformKey,
      missingMessage: usesPlatformKey ? describeMissingKeys() : CUSTOMER_KEY_MISSING,
    },
  };
}
