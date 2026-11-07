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
import { markRecent } from "@/offline/recent";

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const TAB_ID_KIND: Record<QueueTab, IdKind> = {
  games: "game",
  sidebets: "sidebet",
  paytables: "paytable",
  feeSchedules: "feeSchedule",
  sessions: "session",
  rounds: "round",
  reimbursements: "reimbursement",
  payrollMembers: "payrollMember",
  loans: "loanEntry",
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
    const existing = (await database.table(tab).get(id)) as Record<string, unknown> | undefined;
    // Send only what this edit changes. A form re-sending every field from this phone's copy would overwrite
    // anything changed elsewhere since — by another phone, or typed straight into the sheet.
    const changes = existing ? Object.fromEntries(Object.entries(patch).filter(([key, value]) => !sameValue(existing[key], value))) : patch;
    if (Object.keys(changes).length === 0) return;
    if (existing) await database.table(tab).put({ ...existing, ...changes });
    await database.writeQueue.add({
      tab,
      op: "update",
      targetId: id,
      payload: changes,
      expectedVersion,
      baseValues: existing ? Object.fromEntries(Object.keys(changes).map((key) => [key, existing[key] ?? null])) : undefined,
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

  // Deleting something whose create never left this phone: cancel it locally instead of sending a create
  // and then a delete. Only a create that was never sent ("pending") or that the server refused ("blocked")
  // can be cancelled. One that errored or was mid-send may well have reached the server with the reply lost,
  // so the delete is queued behind it and removes the row there too.
  const sameRow = await database.writeQueue.where("tab").equals(tab).filter((item) => item.targetId === id).toArray();
  const unsentCreate = sameRow.find((item) => item.op === "create" && (item.status === "pending" || item.status === "blocked"));
  if (unsentCreate) {
    await database.transaction("rw", database.table(tab), database.writeQueue, async () => {
      await database.table(tab).delete(id);
      await database.writeQueue.bulkDelete(sameRow.map((item) => item.id).filter((qid): qid is number => qid !== undefined));
    });
    return;
  }

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
  constructor(public readonly status: number, operation: string, detail = "") {
    super(`${operation} failed: ${status}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Statuses the flush picks up. "syncing" left behind by a closed app is retried, not stranded. */
const RETRYABLE = new Set(["pending", "error", "syncing"]);
/** Statuses that need a person to decide; later writes to the same row wait behind them. */
const STUCK = new Set(["conflict", "blocked"]);

const rowKey = (item: { tab: string; targetId: string }) => `${item.tab}:${item.targetId}`;

/**
 * True when a conflicting update can be applied on top of the server's newer row without losing anything:
 * every field this edit touches still holds what it held before the edit (or already holds the new value),
 * so whoever saved in between changed only *other* fields. Deletes never auto-merge.
 */
export function canAutoMerge(
  item: Pick<WriteQueueItem, "op" | "payload" | "baseValues">,
  serverRow: Record<string, unknown>,
): boolean {
  if (item.op !== "update" || !item.baseValues) return false;
  return Object.entries(item.payload).every(
    ([field, mine]) => sameValue(serverRow[field], item.baseValues?.[field]) || sameValue(serverRow[field], mine),
  );
}

async function readDetail(res: Response): Promise<string> {
  try {
    const text = await res.text();
    const parsed = JSON.parse(text) as { message?: string; error?: string };
    return parsed.message ?? parsed.error ?? text.slice(0, 200);
  } catch {
    return "";
  }
}

type Outcome = "settled" | "stuck" | "error";

export const SIGNED_OUT = "Signed out — sign in again to send this.";

/** Sends one queued write. Updates its queue row to reflect the result and returns what happened. */
async function sendOne(database: NonNullable<typeof db>, item: WriteQueueItem & { id: number }): Promise<Outcome> {
  const { apiPath } = TAB_CLIENT_CONFIG[item.tab];
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let res: Response;
      if (item.op === "create") {
        res = await fetch(apiPath, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.payload) });
      } else {
        res = await fetch(`${apiPath}/${item.targetId}`, {
          method: item.op === "update" ? "PATCH" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            item.op === "update"
              ? { patch: item.payload, expectedVersion: item.expectedVersion, baseValues: item.baseValues }
              : { expectedVersion: item.expectedVersion },
          ),
        });
      }

      // Signed out (or an old server redirecting to the login page): nothing was saved. Keep the write
      // exactly as it is and stop until the person signs in again — never count it as done or refused.
      if (res.status === 401 || res.redirected) {
        await database.writeQueue.update(item.id, { status: "error", lastError: SIGNED_OUT });
        await database.meta.put({ key: "signedOut", value: "1" });
        return "error";
      }

      if (res.ok || (item.op === "delete" && res.status === 404)) {
        const serverRow = item.op === "delete" ? null : ((await res.json()) as Record<string, unknown>);
        await settle(database, item, serverRow);
        return "settled";
      }

      if (res.status === 409 && item.op !== "create") {
        const conflict = (await res.json()) as { serverRow?: Record<string, unknown> };
        const serverRow = conflict.serverRow;
        if (attempt === 0 && serverRow && typeof serverRow._row_version === "number" && canAutoMerge(item, serverRow)) {
          // Someone saved other fields of this row in between: apply this edit on top of their version.
          item.expectedVersion = serverRow._row_version;
          await database.writeQueue.update(item.id, { expectedVersion: item.expectedVersion });
          continue;
        }
        await database.writeQueue.update(item.id, { status: "conflict", lastError: JSON.stringify(serverRow ?? {}) });
        return "stuck";
      }

      if (res.status >= 400 && res.status < 500) {
        const detail = res.status === 404 ? "This was deleted on another device." : await readDetail(res);
        throw new HttpResponseError(res.status, item.op, detail);
      }
      throw new HttpResponseError(res.status, item.op);
    }
    // Auto-merge retry conflicted again: someone is editing this row right now; ask.
    await database.writeQueue.update(item.id, { status: "conflict" });
    return "stuck";
  } catch (err) {
    const permanent = err instanceof HttpResponseError && err.status >= 400 && err.status < 500;
    await database.writeQueue.update(item.id, {
      status: permanent ? "blocked" : "error",
      lastError: err instanceof Error ? err.message : String(err),
    });
    return permanent ? "stuck" : "error";
  }
}

/**
 * A write landed: store the server's row, drop the queue item, and move every later queued write for the
 * same row onto the new version. Those were made on top of this one (from the same base version), so
 * without this they would collide with this device's own save. Reads the queue fresh rather than a
 * snapshot, so an edit made while this write was in flight is covered too.
 */
async function settle(database: NonNullable<typeof db>, item: WriteQueueItem & { id: number }, serverRow: Record<string, unknown> | null) {
  const newVersion = serverRow?._row_version;
  const baseVersion = item.op === "create" ? 0 : item.expectedVersion;
  const { idField } = TAB_CLIENT_CONFIG[item.tab];
  // The server may answer a create with a row that already existed under another id (the same session saved
  // twice is merged into one). Everything queued for this phone's id then belongs to that row instead.
  const mergedInto = item.op === "create" && serverRow && serverRow[idField] !== item.targetId ? String(serverRow[idField]) : null;
  await database.transaction("rw", database.table(item.tab), database.writeQueue, database.meta, async () => {
    if (mergedInto) {
      await database.table(item.tab).delete(item.targetId);
      await database.meta.put({ key: aliasKey(item.tab, item.targetId), value: mergedInto });
    }
    if (serverRow) await database.table(item.tab).put(serverRow);
    else await database.table(item.tab).delete(item.targetId);
    await database.writeQueue.delete(item.id);
    await database.meta.delete("signedOut");
    if (typeof newVersion !== "number") return;
    const later = await database.writeQueue
      .where("tab")
      .equals(item.tab)
      .filter(
        (other) =>
          other.targetId === item.targetId &&
          other.id !== item.id &&
          (other.op === "update" || other.op === "delete") &&
          other.status !== "syncing" &&
          (mergedInto !== null || other.expectedVersion === baseVersion || (item.op === "create" && other.expectedVersion === undefined)),
      )
      .toArray();
    for (const other of later) {
      if (other.id === undefined) continue;
      await database.writeQueue.update(other.id, { expectedVersion: newVersion, ...(mergedInto ? { targetId: mergedInto } : {}) });
    }
  });
  if (mergedInto) {
    markRecent(item.tab, item.targetId, "deleted");
    markRecent(item.tab, mergedInto, "saved");
  } else {
    markRecent(item.tab, item.targetId, serverRow ? "saved" : "deleted");
  }
  await setLastSyncedAt(new Date().toISOString());
}

const aliasKey = (tab: string, id: string) => `alias:${tab}:${id}`;

/** The id a row now lives under, if this phone's copy was merged into an existing row when it synced. */
export async function mergedId(tab: QueueTab, id: string): Promise<string | null> {
  if (!db) return null;
  return (await db.meta.get(aliasKey(tab, id)))?.value ?? null;
}

/**
 * Sends queued writes in the order they were made. A write that needs a decision (conflict, or refused by the server)
 * only holds back later writes to that same row; everything else keeps syncing. A network or server
 * error ends the pass — the next tick retries. Only one flush runs at a time, across browser tabs too.
 */
export async function flushQueue(): Promise<void> {
  if (!db || flushing) return;
  const database = db;
  const principalId = getActivePrincipalId();
  if (!principalId) return;
  flushing = true;
  try {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (locks?.request) {
      // ifAvailable: if another tab is already flushing this account's queue, let it.
      await locks.request(`cbt-flush-${principalId}`, { ifAvailable: true }, async (lock) => {
        if (lock) await flushPass(database, principalId);
      });
    } else {
      await flushPass(database, principalId);
    }
  } finally {
    flushing = false;
  }
}

async function flushPass(database: NonNullable<typeof db>, principalId: string): Promise<void> {
  // Each item is tried at most once per flush, so an error can't spin; items added mid-flush still go.
  const handled = new Set<number>();
  for (;;) {
    const all = (await database.writeQueue.toArray()).filter((item) => queueItemMatchesPrincipal(item, principalId));
    const stuckRows = new Set(all.filter((item) => STUCK.has(item.status)).map(rowKey));
    const items = all
      .filter((item): item is WriteQueueItem & { id: number } => item.id !== undefined && RETRYABLE.has(item.status) && !handled.has(item.id))
      // In the order they were made. The queue id counts up as writes are added; createdAt is the phone's
      // clock, which can jump backwards (time sync, a dead battery, travel) and would send an edit before its create.
      .sort((a, b) => a.id - b.id);
    if (items.length === 0) return;

    for (const snapshot of items) {
      handled.add(snapshot.id);
      // Writes to a row stay in order: nothing goes ahead of an earlier write to the same row that's stuck.
      if (stuckRows.has(rowKey(snapshot))) continue;
      const item = await database.writeQueue.get(snapshot.id); // fresh: settle() may have moved its version
      if (!item || item.id === undefined || !RETRYABLE.has(item.status)) continue;
      await database.writeQueue.update(item.id, { status: "syncing" });
      const outcome = await sendOne(database, item as WriteQueueItem & { id: number });
      if (outcome === "stuck") stuckRows.add(rowKey(item));
      if (outcome === "error") return;
    }
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
    // "Use mine" means overwrite what's there now, so what's there now is the new starting point.
    ...(item.op === "update" && serverRow
      ? { baseValues: Object.fromEntries(Object.keys(item.payload).map((key) => [key, serverRow[key] ?? null])) }
      : {}),
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
