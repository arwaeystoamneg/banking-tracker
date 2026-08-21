import { db, getActivePrincipalId, setLastSyncedAt, type CacheTab } from "@/offline/db";
import { isQueueTab, TAB_CLIENT_CONFIG } from "@/offline/tabConfig";
import { queueItemMatchesPrincipal } from "@/offline/legacyQueue";

export function mergeServerRowsWithLocal(
  serverRows: Record<string, unknown>[],
  localRows: Record<string, unknown>[],
  idField: string,
  keepLocalOnly: boolean,
): Map<string, Record<string, unknown>> {
  const localById = new Map(localRows.map((row) => [String(row[idField]), row]));
  const merged = new Map(serverRows.map((row) => [String(row[idField]), row]));
  if (keepLocalOnly) {
    for (const [id, local] of localById) {
      if (!merged.has(id)) merged.set(id, local);
    }
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
      );
      const principalId = getActivePrincipalId();
      const queued =
        !isQueueTab(tab) || principalId == null
          ? []
          : (await database.writeQueue.where("tab").equals(tab).sortBy("createdAt")).filter((item) =>
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
