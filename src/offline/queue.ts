import {
  db,
  getActivePrincipalId,
  setLastSyncedAt,
  type QueueOp,
  type QueueTab,
  type WriteQueueItem,
} from "@/offline/db";
import { TAB_CLIENT_CONFIG } from "@/offline/tabConfig";
import { makeId, type IdKind } from "@/lib/ids";
import { queueItemMatchesPrincipal } from "@/offline/legacyQueue";

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
  const database = db;
  const principalId = requireActivePrincipal();
  const { idField } = TAB_CLIENT_CONFIG[tab];
  const id = makeId(TAB_ID_KIND[tab]);

  await database.transaction("rw", database.table(tab), database.writeQueue, async () => {
    await database.table(tab).put({ ...payload, [idField]: id, _row_version: 0 });
    await database.writeQueue.add({
      tab,
      op: "create",
      targetId: id,
      payload: { ...payload, id },
      status: "pending",
      createdAt: new Date().toISOString(),
      principalId,
    });
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
  const database = db;
  const principalId = requireActivePrincipal();

  await database.transaction("rw", database.table(tab), database.writeQueue, async () => {
    const existing = await database.table(tab).get(id);
    if (existing) await database.table(tab).put({ ...existing, ...patch });
    await database.writeQueue.add({
      tab,
      op: "update",
      targetId: id,
      payload: patch,
      expectedVersion,
      status: "pending",
      createdAt: new Date().toISOString(),
      principalId,
    });
  });
}

/** Optimistic delete: removes the row from the local cache immediately, queues the real delete. */
export async function enqueueDelete(tab: QueueTab, id: string): Promise<void> {
  if (!db) throw new Error("Offline queue is only available in the browser");
  const database = db;
  const principalId = requireActivePrincipal();
  const existing = await database.table(tab).get(id);
  const expectedVersion = (existing as { _row_version?: unknown } | undefined)?._row_version;
  if (typeof expectedVersion !== "number") throw new Error(`Cannot delete missing ${tab}/${id}`);

  await database.transaction("rw", database.table(tab), database.writeQueue, async () => {
    await database.table(tab).delete(id);
    await database.writeQueue.add({
      tab,
      op: "delete",
      targetId: id,
      payload: {},
      expectedVersion,
      status: "pending",
      createdAt: new Date().toISOString(),
      principalId,
    });
  });
}

function requireActivePrincipal(): string {
  const principalId = getActivePrincipalId();
  if (!principalId) throw new Error("No active account for offline write");
  return principalId;
}

type Versionable = { op: QueueOp; tab: QueueTab; targetId: string; expectedVersion?: number; id?: number };

/**
 * Once a create/update for (tab,targetId) settles at `newVersion`, every *later* queued update to the
 * same row must expect that version — otherwise a user's own sequential edits (or a create followed by
 * an edit before it syncs) collide with themselves and surface a spurious conflict. Mutates the later
 * items in place so the in-flight loop uses the corrected value, and returns their queue ids so the
 * durable copies can be updated too.
 */
export function chainVersionAfterSettle<T extends Versionable>(
  items: T[],
  settledIndex: number,
  newVersion: number,
): number[] {
  const settled = items[settledIndex];
  const touched: number[] = [];
  for (let i = settledIndex + 1; i < items.length; i += 1) {
    const later = items[i];
    if (
      (later.op !== "update" && later.op !== "delete") ||
      later.tab !== settled.tab ||
      later.targetId !== settled.targetId
    ) {
      continue;
    }
    if (later.expectedVersion === newVersion) continue;
    later.expectedVersion = newVersion;
    if (later.id !== undefined) touched.push(later.id);
  }
  return touched;
}

let flushing = false;

class HttpResponseError extends Error {
  constructor(public readonly status: number, operation: string) {
    super(`${operation} failed: ${status}`);
  }
}

/** Flushes queued writes FIFO. Safe to call repeatedly — re-entrant calls are no-ops while one is in flight. */
export async function flushQueue(): Promise<void> {
  if (!db || flushing) return;
  // Captured as a local const so nested closures below stay narrowed to non-null — TS otherwise
  // loses the narrowing on `db` once it's read inside an arrow function passed to itself.
  const database = db;
  const principalId = getActivePrincipalId();
  if (!principalId) return;
  flushing = true;
  // Ids handled this pass. Lets us pick up writes enqueued *during* the flush (so they don't wait for
  // the next interval tick) without re-processing an item that just errored into a tight retry loop.
  const handled = new Set<number>();
  try {
    for (;;) {
      const items = (await database.writeQueue.where("status").anyOf("pending", "error").sortBy("createdAt")).filter(
        (item): item is WriteQueueItem & { id: number } =>
          item.id !== undefined && !handled.has(item.id) && queueItemMatchesPrincipal(item, principalId),
      );
      if (items.length === 0) break;

      let shouldStop = false;
      for (let idx = 0; idx < items.length; idx += 1) {
        const item = items[idx];
        handled.add(item.id);
        await database.writeQueue.update(item.id, { status: "syncing" });

        try {
          const { apiPath } = TAB_CLIENT_CONFIG[item.tab];

          if (item.op === "create") {
            const res = await fetch(apiPath, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(item.payload),
            });
            if (!res.ok) throw new HttpResponseError(res.status, "create");
            const serverRow = await res.json();

            // Same id as the optimistic row (see enqueueCreate) — this just refreshes _row_version
            // and any server-side defaults, it never needs to move the row to a new key.
            await database.transaction("rw", database.table(item.tab), database.writeQueue, async () => {
              await database.table(item.tab).put(serverRow);
              await database.writeQueue.delete(item.id);
            });
            await applyVersionChain(database, items, idx, serverRow);
            await setLastSyncedAt(new Date().toISOString());
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
              shouldStop = true;
              break;
            }
            if (!res.ok) throw new HttpResponseError(res.status, "update");

            const serverRow = await res.json();
            await database.transaction("rw", database.table(item.tab), database.writeQueue, async () => {
              await database.table(item.tab).put(serverRow);
              await database.writeQueue.delete(item.id);
            });
            await applyVersionChain(database, items, idx, serverRow);
            await setLastSyncedAt(new Date().toISOString());
          } else {
            const res = await fetch(`${apiPath}/${item.targetId}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ expectedVersion: item.expectedVersion }),
            });
            if (res.status === 409) {
              const conflict = await res.json();
              await database.writeQueue.update(item.id, {
                status: "conflict",
                lastError: JSON.stringify(conflict.serverRow ?? {}),
              });
              shouldStop = true;
              break;
            }
            if (!res.ok && res.status !== 404) throw new HttpResponseError(res.status, "delete");
            await database.writeQueue.delete(item.id);
            await setLastSyncedAt(new Date().toISOString());
          }
        } catch (err) {
          await database.writeQueue.update(item.id, {
            status: err instanceof HttpResponseError && err.status >= 400 && err.status < 500 ? "blocked" : "error",
            lastError: err instanceof Error ? err.message : String(err),
          });
          shouldStop = true;
          break;
        }
      }
      if (shouldStop) break;
    }
  } finally {
    flushing = false;
  }
}

/** Persists the expectedVersion advance for later same-row updates after a settle (see chainVersionAfterSettle). */
async function applyVersionChain(
  database: NonNullable<typeof db>,
  items: (WriteQueueItem & { id: number })[],
  settledIndex: number,
  serverRow: unknown,
): Promise<void> {
  const newVersion = (serverRow as { _row_version?: unknown })?._row_version;
  if (typeof newVersion !== "number") return;
  const touched = chainVersionAfterSettle(items, settledIndex, newVersion);
  for (const queueId of touched) {
    await database.writeQueue.update(queueId, { expectedVersion: newVersion });
  }
}

export async function resolveConflict(queueItemId: number, resolution: "keep-mine" | "discard-mine"): Promise<void> {
  if (!db) return;
  const database = db;
  const item = await database.writeQueue.get(queueItemId);
  if (!item) return;
  const serverRow = parseServerRow(item.lastError);

  if (resolution === "discard-mine") {
    await database.transaction("rw", database.table(item.tab), database.writeQueue, async () => {
      if (serverRow) await database.table(item.tab).put(serverRow);
      await database.writeQueue.delete(queueItemId);
    });
    if (!serverRow) {
      const { refreshTabCache } = await import("@/offline/cache");
      await refreshTabCache(item.tab);
    }
    return;
  }
  const serverVersion = serverRow?._row_version;
  if (typeof serverVersion !== "number") throw new Error("Conflict response did not include a server version");
  await database.writeQueue.update(queueItemId, {
    status: "pending",
    expectedVersion: serverVersion,
    lastError: undefined,
  });
  void flushQueue();
}

function parseServerRow(value: string | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
