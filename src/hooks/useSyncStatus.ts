import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/offline/db";

export interface SyncStatus {
  pendingCount: number;
  conflictCount: number;
  lastSyncedAt: string | null;
  /** The server said this phone's sign-in has expired while sending saved changes. */
  signedOut: boolean;
}

export function useSyncStatus(): SyncStatus {
  const pendingCount =
    useLiveQuery(() => (db ? db.writeQueue.where("status").anyOf("pending", "syncing", "error").count() : 0), []) ?? 0;
  const conflictCount =
    useLiveQuery(() => (db ? db.writeQueue.where("status").anyOf("conflict", "blocked").count() : 0), []) ?? 0;
  const lastSyncedAt = useLiveQuery(async () => (db ? ((await db.meta.get("lastSyncedAt"))?.value ?? null) : null), []) ?? null;

  const signedOut = useLiveQuery(async () => (db ? Boolean(await db.meta.get("signedOut")) : false), []) ?? false;

  return { pendingCount, conflictCount, lastSyncedAt, signedOut: signedOut && pendingCount > 0 };
}
