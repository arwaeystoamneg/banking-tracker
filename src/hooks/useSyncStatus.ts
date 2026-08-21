import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/offline/db";

export interface SyncStatus {
  pendingCount: number;
  conflictCount: number;
  lastSyncedAt: string | null;
}

export function useSyncStatus(): SyncStatus {
  const pendingCount =
    useLiveQuery(() => (db ? db.writeQueue.where("status").anyOf("pending", "syncing", "error").count() : 0), []) ?? 0;
  const conflictCount = useLiveQuery(() => (db ? db.writeQueue.where("status").equals("conflict").count() : 0), []) ?? 0;
  const lastSyncedAt = useLiveQuery(async () => (db ? ((await db.meta.get("lastSyncedAt"))?.value ?? null) : null), []) ?? null;

  return { pendingCount, conflictCount, lastSyncedAt };
}
