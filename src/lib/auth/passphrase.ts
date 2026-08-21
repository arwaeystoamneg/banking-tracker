import "server-only";

export const AUTH_COOKIE_NAME = "cbt_auth";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // ~90 days — three known users, rarely need to re-enter it
const encoder = new TextEncoder();

function getSecret(): string {
  const secret = process.env.APP_PASSPHRASE;
  if (!secret) throw new Error("APP_PASSPHRASE is not set");
  return secret;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fixedTimeEqual(expected: Uint8Array, actual: Uint8Array): boolean {
  let mismatch = expected.length ^ actual.length;
  const length = Math.max(expected.length, actual.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (expected[index] ?? 0) ^ (actual[index] ?? 0);
  }
  return mismatch === 0;
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

/** Constant-work comparison against the shared passphrase — avoids a timing side-channel on login. */
export async function checkPassphrase(candidate: string): Promise<boolean> {
  const [expected, actual] = await Promise.all([digest(getSecret()), digest(candidate)]);
  return fixedTimeEqual(expected, actual);
}

/** Builds the signed cookie value: `${issuedAt}.${hmac}`. No session store — verified per request. */
export async function makeAuthToken(): Promise<string> {
  const issuedAt = Date.now().toString();
  return `${issuedAt}.${await sign(issuedAt)}`;
}

export async function verifyAuthToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature) return false;
  const expected = encoder.encode(await sign(issuedAt));
  const actual = encoder.encode(signature);
  return fixedTimeEqual(expected, actual);
}

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: COOKIE_MAX_AGE_SECONDS,
};
