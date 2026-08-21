import { db } from "@/offline/db";
import type { QueueTab } from "@/offline/db";
import { TAB_CLIENT_CONFIG } from "@/offline/tabConfig";

/** Fetches a tab fresh from the API and repopulates its Dexie cache — the "revalidate" half of the read path. */
export async function refreshTabCache(tab: QueueTab): Promise<unknown[]> {
  const { apiPath } = TAB_CLIENT_CONFIG[tab];
  const res = await fetch(apiPath, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${apiPath}: ${res.status}`);
  const rows: unknown[] = await res.json();

  if (db) {
    const table = db.table(tab);
    await db.transaction("rw", table, async () => {
      await table.clear();
      await table.bulkPut(rows);
    });
  }
  return rows;
}

/** Reads whatever is cached locally right now — instant, works offline. */
export async function readTabCache<T>(tab: QueueTab): Promise<T[]> {
  if (!db) return [];
  return db.table(tab).toArray();
}
