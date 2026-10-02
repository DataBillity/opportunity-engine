import { getAuthSecret } from "@/lib/auth";
import { base64UrlToBytes, bytesToBase64Url } from "@/lib/password";

const KEY_VERSION = 1;

function encoder() {
  return new TextEncoder();
}

function decoder() {
  return new TextDecoder();
}

async function aesKey(): Promise<CryptoKey> {
  const secret = getAuthSecret();
  if (!secret) throw new Error("AUTH_SECRET is not set");
  const material = await crypto.subtle.digest("SHA-256", encoder().encode(secret));
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** AES-256-GCM. The stored value is base64url(iv + ciphertext) and never includes the raw secret. */
export async function encryptSecret(plaintext: string): Promise<{ ciphertext: string; keyVersion: number }> {
  const key = await aesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder().encode(plaintext),
  ));
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv, 0);
  packed.set(cipher, iv.length);
  return { ciphertext: bytesToBase64Url(packed), keyVersion: KEY_VERSION };
}

export async function decryptSecret(ciphertext: string, keyVersion: number): Promise<string> {
  if (keyVersion !== KEY_VERSION) throw new Error("This secret uses an unknown key version.");
  const packed = base64UrlToBytes(ciphertext);
  if (packed.length <= 12) throw new Error("Stored secret is unreadable.");
  const iv = packed.slice(0, 12);
  const cipher = packed.slice(12);
  const key = await aesKey();
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return decoder().decode(plain);
}
