import "server-only";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

interface Attempt {
  failures: number;
  windowStartedAt: number;
}

const globalForAttempts = globalThis as unknown as { __loginAttempts?: Map<string, Attempt> };
const attempts = globalForAttempts.__loginAttempts ?? new Map<string, Attempt>();
globalForAttempts.__loginAttempts = attempts;

export function canAttemptLogin(key: string): boolean {
  const attempt = attempts.get(key);
  if (!attempt) return true;
  if (Date.now() - attempt.windowStartedAt >= WINDOW_MS) {
    attempts.delete(key);
    return true;
  }
  return attempt.failures < MAX_FAILURES;
}

export function recordLoginFailure(key: string): void {
  const existing = attempts.get(key);
  if (!existing || Date.now() - existing.windowStartedAt >= WINDOW_MS) {
    attempts.set(key, { failures: 1, windowStartedAt: Date.now() });
    return;
  }
  existing.failures += 1;
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}
