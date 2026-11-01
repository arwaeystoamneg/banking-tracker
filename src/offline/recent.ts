/**
 * Rows this device saved or deleted in the last few seconds. The server may answer a list from a copy up to
 * five seconds old (see loader.ts), so a refresh right after a save can briefly lack a row this phone just
 * created, or still contain one it just deleted. The cache merge uses this to keep the phone's view.
 */
const WINDOW_MS = 30_000;
const recent = new Map<string, { kind: "saved" | "deleted"; at: number }>();

const key = (tab: string, id: string) => `${tab}:${id}`;

export function markRecent(tab: string, id: string, kind: "saved" | "deleted", now = Date.now()): void {
  recent.set(key(tab, id), { kind, at: now });
}

export function recentState(tab: string, id: string, now = Date.now()): "saved" | "deleted" | null {
  const entry = recent.get(key(tab, id));
  if (!entry) return null;
  if (now - entry.at > WINDOW_MS) {
    recent.delete(key(tab, id));
    return null;
  }
  return entry.kind;
}

export function clearRecent(): void {
  recent.clear();
}
