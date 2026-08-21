import { db, setLastSyncedAt, type QueueTab } from "@/offline/db";
import { TAB_CLIENT_CONFIG } from "@/offline/tabConfig";
import { makeId, type IdKind } from "@/lib/ids";

const TAB_ID_KIND: Record<QueueTab, IdKind> = {
  games: "game",
  sidebets: "sidebet",
  paytables: "paytable",
  feeSchedules: "feeSchedule",
  sessions: "session",
  rounds: "round",
};

/**
 * Optimistic create: writes a client-generated-id row to the local cache immediately, queues the real
 * write with that same id. Because the id is final (not temporary), the row — and any URL built from
 * its id — stays stable across the sync, whether it flushes in 50ms or after an hour offline.
 */
export async function enqueueCreate(tab: QueueTab, payload: Record<string, unknown>): Promise<string> {
  if (!db) throw new Error("Offline queue is only available in the browser");
  const { idField } = TAB_CLIENT_CONFIG[tab];
  const id = makeId(TAB_ID_KIND[tab]);

  await db.table(tab).put({ ...payload, [idField]: id, _row_version: 0 });
  await db.writeQueue.add({
    tab,
    op: "create",
    targetId: id,
    payload: { ...payload, id },
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  return id;
}

/** Optimistic update: patches the local cache row immediately, queues the real write. */
export async function enqueueUpdate(
  tab: QueueTab,
  id: string,
  patch: Record<string, unknown>,
  expectedVersion: number,
): Promise<void> {
  if (!db) throw new Error("Offline queue is only available in the browser");

  const existing = await db.table(tab).get(id);
  if (existing) {
    await db.table(tab).put({ ...existing, ...patch });
  }

  await db.writeQueue.add({
    tab,
    op: "update",
    targetId: id,
    payload: patch,
    expectedVersion,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
}

/** Optimistic delete: removes the row from the local cache immediately, queues the real delete. */
export async function enqueueDelete(tab: QueueTab, id: string): Promise<void> {
  if (!db) throw new Error("Offline queue is only available in the browser");

  await db.table(tab).delete(id);
  await db.writeQueue.add({
    tab,
    op: "delete",
    targetId: id,
    payload: {},
    status: "pending",
    createdAt: new Date().toISOString(),
  });
}

let flushing = false;

/** Flushes queued writes FIFO. Safe to call repeatedly — re-entrant calls are no-ops while one is in flight. */
export async function flushQueue(): Promise<void> {
  if (!db || flushing) return;
  // Captured as a local const so nested closures below stay narrowed to non-null — TS otherwise
  // loses the narrowing on `db` once it's read inside an arrow function passed to itself.
  const database = db;
  flushing = true;
  try {
    const items = await database.writeQueue.where("status").anyOf("pending", "error").sortBy("createdAt");

    for (const item of items) {
      if (item.id === undefined) continue;
      await database.writeQueue.update(item.id, { status: "syncing" });

      try {
        const { apiPath } = TAB_CLIENT_CONFIG[item.tab];

        if (item.op === "create") {
          const res = await fetch(apiPath, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item.payload),
          });
          if (!res.ok) throw new Error(`create failed: ${res.status}`);
          const serverRow = await res.json();

          // Same id as the optimistic row (see enqueueCreate) — this just refreshes _row_version
          // and any server-side defaults, it never needs to move the row to a new key.
          await database.transaction("rw", database.table(item.tab), database.writeQueue, async () => {
            await database.table(item.tab).put(serverRow);
            await database.writeQueue.delete(item.id!);
          });
        } else if (item.op === "update") {
          const res = await fetch(`${apiPath}/${item.targetId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ patch: item.payload, expectedVersion: item.expectedVersion }),
          });

          if (res.status === 409) {
            const conflict = await res.json();
            await database.writeQueue.update(item.id, {
              status: "conflict",
              lastError: JSON.stringify(conflict.serverRow ?? {}),
            });
            continue;
          }
          if (!res.ok) throw new Error(`update failed: ${res.status}`);

          const serverRow = await res.json();
          await database.transaction("rw", database.table(item.tab), database.writeQueue, async () => {
            await database.table(item.tab).put(serverRow);
            await database.writeQueue.delete(item.id!);
          });
        } else {
          const res = await fetch(`${apiPath}/${item.targetId}`, { method: "DELETE" });
          if (!res.ok && res.status !== 404) throw new Error(`delete failed: ${res.status}`);
          await database.writeQueue.delete(item.id!);
        }
      } catch (err) {
        await database.writeQueue.update(item.id, {
          status: "error",
          lastError: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await setLastSyncedAt(new Date().toISOString());
  } finally {
    flushing = false;
  }
}

export async function resolveConflict(queueItemId: number, resolution: "keep-mine" | "discard-mine"): Promise<void> {
  if (!db) return;
  if (resolution === "discard-mine") {
    await db.writeQueue.delete(queueItemId);
    return;
  }
  // Keep-mine: re-queue as pending so the next flush retries with a fresh expectedVersion once the
  // user has re-opened the record (the UI is responsible for refetching before retrying).
  await db.writeQueue.update(queueItemId, { status: "pending", lastError: undefined });
}
