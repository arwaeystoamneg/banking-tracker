import { db, getActivePrincipalId, setLastSyncedAt, type CacheTab } from "@/offline/db";
import { isQueueTab, TAB_CLIENT_CONFIG } from "@/offline/tabConfig";
import { queueItemMatchesPrincipal } from "@/offline/legacyQueue";
import { recentState } from "@/offline/recent";

export function mergeServerRowsWithLocal(
  serverRows: Record<string, unknown>[],
  localRows: Record<string, unknown>[],
  idField: string,
  keepLocalOnly: boolean,
  recent: (id: string) => "saved" | "deleted" | null = () => null,
): Map<string, Record<string, unknown>> {
  const localById = new Map(localRows.map((row) => [String(row[idField]), row]));
  const merged = new Map(serverRows.map((row) => [String(row[idField]), row]));
  // The server may answer from a copy a few seconds old. Never let it roll back a row this phone already
  // holds a newer version of (e.g. one it just saved): that would also make its next edit a false conflict.
  for (const [id, server] of merged) {
    const local = localById.get(id);
    if (local && Number(local._row_version) > Number(server._row_version)) merged.set(id, local);
  }
  for (const [id, local] of localById) {
    // A row this phone saved seconds ago may not be in a slightly old server copy yet: keep it.
    if (!merged.has(id) && (keepLocalOnly || recent(id) === "saved")) merged.set(id, local);
  }
  for (const id of [...merged.keys()]) {
    // …and a row it just deleted may still be in one: don't bring it back.
    if (recent(id) === "deleted") merged.delete(id);
  }
  return merged;
}

/** Fetches a tab fresh from the API and repopulates its Dexie cache — the "revalidate" half of the read path. */
export async function refreshTabCache(tab: CacheTab): Promise<unknown[]> {
  const { apiPath } = TAB_CLIENT_CONFIG[tab];
  const res = await fetch(apiPath, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${apiPath}: ${res.status}`);
  const rows: unknown[] = await res.json();

  if (db) {
    const database = db;
    const table = database.table(tab);
    const { idField } = TAB_CLIENT_CONFIG[tab];
    await database.transaction("rw", table, database.writeQueue, async () => {
      const localRows = (await table.toArray()) as Record<string, unknown>[];
      const localById = new Map(localRows.map((row) => [String(row[idField]), row]));
      const merged = mergeServerRowsWithLocal(
        rows as Record<string, unknown>[],
        localRows,
        idField,
        !isQueueTab(tab),
        (id) => recentState(tab, id),
      );
      const principalId = getActivePrincipalId();
      const queued =
        !isQueueTab(tab) || principalId == null
          ? []
          : (await database.writeQueue.where("tab").equals(tab).toArray()).sort((a, b) => (a.id ?? 0) - (b.id ?? 0)).filter((item) =>
              queueItemMatchesPrincipal(item, principalId),
            );

      for (const item of queued) {
        if (item.op === "create") {
          const local = localById.get(item.targetId);
          if (local) merged.set(item.targetId, local);
        } else if (item.op === "update") {
          const base = merged.get(item.targetId) ?? localById.get(item.targetId);
          if (base) merged.set(item.targetId, { ...base, ...item.payload });
        } else {
          merged.delete(item.targetId);
        }
      }

      await table.clear();
      await table.bulkPut([...merged.values()]);
    });
    // A successful read is a sync too — otherwise "Last synced" only moves when this phone saves something.
    await setLastSyncedAt(new Date().toISOString());
  }
  return rows;
}

/** Pull every cached tab from the API. Used by Sync now — loss reports never enter the write queue. */
export async function refreshAllTabCaches(): Promise<void> {
  const tabs = Object.keys(TAB_CLIENT_CONFIG) as CacheTab[];
  const results = await Promise.allSettled(tabs.map((tab) => refreshTabCache(tab)));
  if (results.some((result) => result.status === "fulfilled")) {
    await setLastSyncedAt(new Date().toISOString());
  }
  const firstReject = results.find((result) => result.status === "rejected");
  if (firstReject && firstReject.status === "rejected") throw firstReject.reason;
}

/** Reads whatever is cached locally right now — instant, works offline. */
export async function readTabCache<T>(tab: CacheTab): Promise<T[]> {
  if (!db) return [];
  return db.table(tab).toArray();
}
