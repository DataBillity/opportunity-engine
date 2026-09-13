const COOKIE_NAME = "oe_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export { COOKIE_NAME, SESSION_MAX_AGE_SEC };

export type Session = {
  email: string;
};

function encoder() {
  return new TextEncoder();
}

function decoder() {
  return new TextDecoder();
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  const aa = encoder().encode(a);
  const bb = encoder().encode(b);
  const len = Math.max(aa.length, bb.length);
  let mismatch = aa.length === bb.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    mismatch |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return mismatch === 0;
}

async function hmacSign(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder().encode(value));
  return bytesToBase64Url(new Uint8Array(sig));
}

export function getAuthSecret(): string {
  return (process.env.AUTH_SECRET ?? "").trim();
}

export function getExpectedCredentials(): { username: string; password: string } {
  return {
    username: (process.env.AUTH_USERNAME ?? "").trim().toLowerCase(),
    password: process.env.AUTH_PASSWORD ?? "",
  };
}

export function authIsConfigured(): boolean {
  const { username, password } = getExpectedCredentials();
  return Boolean(getAuthSecret() && username && password);
}

export function credentialsMatch(username: string, password: string): boolean {
  const expected = getExpectedCredentials();
  if (!expected.username || !expected.password) return false;
  const userOk = timingSafeEqual(username.trim().toLowerCase(), expected.username);
  const passOk = timingSafeEqual(password, expected.password);
  return userOk && passOk;
}

export async function createSessionToken(email: string): Promise<string> {
  const secret = getAuthSecret();
  if (!secret) throw new Error("AUTH_SECRET is not set");
  const payload = bytesToBase64Url(
    encoder().encode(JSON.stringify({ e: email.trim().toLowerCase(), exp: Date.now() + SESSION_MAX_AGE_SEC * 1000 })),
  );
  const signature = await hmacSign(secret, payload);
  return `${payload}.${signature}`;
}

export async function readSessionToken(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  const secret = getAuthSecret();
  if (!secret) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = await hmacSign(secret, payload);
  if (!timingSafeEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(decoder().decode(base64UrlToBytes(payload))) as { e?: string; exp?: number };
    if (!parsed.e || typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
    return { email: parsed.e };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_SEC) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function clearedSessionCookieOptions() {
  return {
    ...sessionCookieOptions(0),
    expires: new Date(0),
  };
}
