import "server-only";

import type { AuthUser } from "@/lib/auth/types";

export const AUTH_COOKIE_NAME = "cbt_auth";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // ~90 days — three known users, rarely need to re-enter it
const encoder = new TextEncoder();

function getSecret(): string {
  const secret = process.env.APP_PASSPHRASE;
  if (!secret) throw new Error("APP_PASSPHRASE is not set");
  return secret;
}

function getSigningSecret(): string {
  const secret = process.env.AUTH_COOKIE_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production") return `development-only:${getSecret()}`;
  throw new Error("AUTH_COOKIE_SECRET must be set to at least 32 random characters");
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

function base64UrlEncode(value: string): string {
  const bytes = encoder.encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  } catch {
    return null;
  }
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSigningSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

export async function makeCredentialVersion(credential: string): Promise<string> {
  return sign(`credential:${credential}`);
}

/** Constant-work comparison for credentials — avoids a timing side-channel on login. */
export async function checkSecret(candidate: string, expectedSecret: string): Promise<boolean> {
  const [expected, actual] = await Promise.all([digest(expectedSecret), digest(candidate)]);
  return fixedTimeEqual(expected, actual);
}

export async function checkPassphrase(candidate: string): Promise<boolean> {
  return checkSecret(candidate, getSecret());
}

interface AuthTokenPayload extends AuthUser {
  issuedAt: number;
  expiresAt: number;
  accountVersion?: string;
}

/** Builds a signed, stateless role/identity cookie. */
export async function makeAuthToken(user: AuthUser): Promise<string> {
  const issuedAt = Date.now();
  const payload = base64UrlEncode(
    JSON.stringify({
      ...user,
      issuedAt,
      expiresAt: issuedAt + COOKIE_MAX_AGE_SECONDS * 1000,
    } satisfies AuthTokenPayload),
  );
  return `${payload}.${await sign(payload)}`;
}

export async function verifyAuthToken(token: string | undefined | null): Promise<AuthUser | null> {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = encoder.encode(await sign(payload));
  const actual = encoder.encode(signature);
  if (!fixedTimeEqual(expected, actual)) return null;

  const decoded = base64UrlDecode(payload);
  if (!decoded) return null;

  try {
    const value = JSON.parse(decoded) as Partial<AuthTokenPayload>;
    if (
      (value.role !== "admin" &&
        value.role !== "individual" &&
        value.role !== "employee" &&
        value.role !== "demo") ||
      typeof value.userId !== "string" ||
      !value.userId ||
      typeof value.name !== "string" ||
      !value.name ||
      typeof value.issuedAt !== "number" ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= Date.now() ||
      (value.role !== "demo" && (typeof value.accountVersion !== "string" || !value.accountVersion))
    ) {
      return null;
    }
    return {
      role: value.role,
      userId: value.userId,
      name: value.name,
      ...(value.accountVersion ? { accountVersion: value.accountVersion } : {}),
    };
  } catch {
    return null;
  }
}

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: COOKIE_MAX_AGE_SECONDS,
};
