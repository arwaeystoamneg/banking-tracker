import "server-only";

/**
 * In-memory attempt counters, per server instance. Several instances each keep their own count, so the
 * real limit is a small multiple of these numbers; that's still far too slow for password guessing, and the
 * scrypt cost does the rest.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
/** One address across all usernames: stops a guesser rotating usernames to dodge the per-username limit. */
export const MAX_FAILURES_PER_ADDRESS = 30;
/** Sign-ups from one address per window; nobody needs more than a couple of accounts. */
export const MAX_SIGNUPS_PER_ADDRESS = 3;
const MAX_KEYS = 10_000;

interface Attempt {
  failures: number;
  windowStartedAt: number;
}

const globalForAttempts = globalThis as unknown as { __loginAttempts?: Map<string, Attempt> };
const attempts = globalForAttempts.__loginAttempts ?? new Map<string, Attempt>();
globalForAttempts.__loginAttempts = attempts;

export function canAttemptLogin(key: string, max = MAX_FAILURES): boolean {
  const attempt = attempts.get(key);
  if (!attempt) return true;
  if (Date.now() - attempt.windowStartedAt >= WINDOW_MS) {
    attempts.delete(key);
    return true;
  }
  return attempt.failures < max;
}

export function recordLoginFailure(key: string): void {
  const existing = attempts.get(key);
  if (!existing || Date.now() - existing.windowStartedAt >= WINDOW_MS) {
    // Random keys can't grow the map without bound: drop expired entries, then the oldest.
    if (attempts.size >= MAX_KEYS) {
      for (const [k, v] of attempts) if (Date.now() - v.windowStartedAt >= WINDOW_MS) attempts.delete(k);
      if (attempts.size >= MAX_KEYS) attempts.delete(attempts.keys().next().value!);
    }
    attempts.set(key, { failures: 1, windowStartedAt: Date.now() });
    return;
  }
  existing.failures += 1;
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}
