/**
 * Keyed, time-limited promise cache. Google allows ~60 Sheets reads a minute for the whole team (one
 * service account), so concurrent and back-to-back reads share one fetch instead of each spending quota.
 * Concurrent callers get the same in-flight promise; a failed fetch is dropped so the next call retries.
 */
export function createTtlCache<T>(ttlMs: number, now: () => number = Date.now) {
  const entries = new Map<string, { at: number; value: Promise<T> }>();

  return {
    get(key: string, load: () => Promise<T>): Promise<T> {
      const hit = entries.get(key);
      if (hit && now() - hit.at < ttlMs) return hit.value;
      const value = load();
      const entry = { at: now(), value };
      entries.set(key, entry);
      value.catch(() => {
        if (entries.get(key) === entry) entries.delete(key);
      });
      return value;
    },
    invalidate(key: string): void {
      entries.delete(key);
    },
  };
}
