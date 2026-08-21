import { db, getActivePrincipalId, type CacheTab } from "@/offline/db";
import { isQueueTab, TAB_CLIENT_CONFIG } from "@/offline/tabConfig";
import { queueItemMatchesPrincipal } from "@/offline/legacyQueue";

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
      const merged = new Map(
        (rows as Record<string, unknown>[]).map((row) => [String(row[idField]), row]),
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

/** Reads whatever is cached locally right now — instant, works offline. */
export async function readTabCache<T>(tab: CacheTab): Promise<T[]> {
  if (!db) return [];
  return db.table(tab).toArray();
}
