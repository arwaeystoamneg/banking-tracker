import "server-only";

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing for self-registered accounts. These hashes sit in the Accounts tab of the live sheet,
 * which several people can open, so they must be slow to brute-force: scrypt with a per-account salt.
 * Format: `scrypt$N$r$p$saltBase64$hashBase64`, so the cost can be raised later without breaking old hashes.
 */

/** 2^17: about a third of a second per guess on a server, the level OWASP recommends for scrypt. Raised from 2^14 on
 * 2026-11-19; older hashes still verify and are upgraded at the next successful sign-in (needsRehash). */
const N = 131072;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
/** Longer passwords are refused before hashing, so nobody can make the server hash megabytes. */
export const MAX_PASSWORD_LENGTH = 256;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { ...options, maxmem: 256 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  return hashPasswordWithCost(password, N);
}

/** hashPassword at a chosen cost; only tests use another cost (to make an old-style hash). */
export async function hashPasswordWithCost(password: string, cost: number): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N: cost, r: R, p: P });
  return `scrypt$${cost}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** True when a stored hash was made with a lower cost than today's and should be re-hashed. */
export function needsRehash(stored: string): boolean {
  const parts = stored.trim().split("$");
  return parts[0] === "scrypt" && (Number(parts[1]) < N || Number(parts[2]) !== R || Number(parts[3]) !== P);
}

let dummyHash: Promise<string> | null = null;
/**
 * Spends the same time as checking a real password, for usernames that don't exist, so how long a failed
 * sign-in takes doesn't reveal which usernames are real.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("not-a-real-account-password");
  await verifyPassword(password, await dummyHash);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.trim().split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltText, hashText] = parts;
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  if (![cost.N, cost.r, cost.p].every((value) => Number.isInteger(value) && value > 0)) return false;
  const expected = Buffer.from(hashText, "base64");
  if (expected.length !== KEY_LENGTH || password.length > MAX_PASSWORD_LENGTH) return false;
  try {
    const actual = await derive(password, Buffer.from(saltText, "base64"), cost);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
