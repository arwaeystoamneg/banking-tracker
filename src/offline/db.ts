import Dexie, { type Table } from "dexie";
import type { FeeSchedule, Game, Paytable, Round, Session, Sidebet } from "@/lib/validation/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { queueItemBelongsToUser, type LegacyOwnerTables } from "@/offline/legacyQueue";

export type QueueOp = "create" | "update" | "delete";
export type QueueStatus = "pending" | "syncing" | "error" | "conflict" | "blocked";
export type QueueTab = "games" | "sidebets" | "paytables" | "feeSchedules" | "sessions" | "rounds";

export interface WriteQueueItem {
  id?: number;
  tab: QueueTab;
  op: QueueOp;
  /** The real id once known (server or client-temp), and the id field name for that tab. */
  targetId: string;
  payload: Record<string, unknown>;
  expectedVersion?: number;
  status: QueueStatus;
  createdAt: string;
  lastError?: string;
  principalId?: string;
}

export interface MetaRow {
  key: string;
  value: string;
}

class OfflineDatabase extends Dexie {
  games!: Table<Game, string>;
  sidebets!: Table<Sidebet, string>;
  paytables!: Table<Paytable, string>;
  feeSchedules!: Table<FeeSchedule, string>;
  sessions!: Table<Session, string>;
  rounds!: Table<Round, string>;
  writeQueue!: Table<WriteQueueItem, number>;
  meta!: Table<MetaRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      games: "game_id, name",
      sidebets: "sidebet_id, game_id",
      paytables: "paytable_id, sidebet_id",
      feeSchedules: "schedule_id, game_id",
      sessions: "session_id, game_id, date",
      rounds: "round_id, session_id, seq",
      writeQueue: "++id, tab, status, createdAt",
      meta: "key",
    });
  }
}

export let db: OfflineDatabase | null = null;
let activePrincipalId: string | null = null;

export function getActivePrincipalId(): string | null {
  return activePrincipalId;
}

export async function configureOfflineDatabase(user: AuthUser): Promise<void> {
  if (typeof window === "undefined") return;
  if (db && activePrincipalId === user.userId) return;

  db?.close();
  const safeId = user.userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const next = new OfflineDatabase(`cardroom-banking-tool-user-${safeId}`);
  await next.open();
  if (user.role !== "demo") {
    await migrateLegacyDatabase(next, "cardroom-banking-tool", user);
    await migrateLegacyDatabase(next, "cardroom-banking-tool-live", user);
  }
  db = next;
  activePrincipalId = user.userId;
}

async function migrateLegacyDatabase(target: OfflineDatabase, legacyName: string, user: AuthUser): Promise<void> {
  if (!(await Dexie.exists(legacyName))) return;
  const legacy = new OfflineDatabase(legacyName);
  await legacy.open();
  let leftoverQueue = 1;
  try {
    const [games, sidebets, paytables, feeSchedules, sessions, rounds, queue, meta] = await Promise.all([
      legacy.games.toArray(),
      legacy.sidebets.toArray(),
      legacy.paytables.toArray(),
      legacy.feeSchedules.toArray(),
      legacy.sessions.toArray(),
      legacy.rounds.toArray(),
      legacy.writeQueue.toArray(),
      legacy.meta.toArray(),
    ]);
    const tables: LegacyOwnerTables = { games, sidebets, paytables, feeSchedules, sessions, rounds };
    const migratedKey = `legacyMigrated:${legacyName}`;
    const claimedIds: number[] = [];

    await target.transaction("rw", target.tables, async () => {
      if (!(await target.meta.get(migratedKey))) {
        await target.games.bulkPut(games);
        await target.sidebets.bulkPut(sidebets);
        await target.paytables.bulkPut(paytables);
        await target.feeSchedules.bulkPut(feeSchedules);
        await target.sessions.bulkPut(sessions);
        await target.rounds.bulkPut(rounds);
        await target.meta.bulkPut(meta);
        await target.meta.put({ key: migratedKey, value: "1" });
      }
      for (const item of queue) {
        if (!queueItemBelongsToUser(item, user, tables)) continue;
        const rest: WriteQueueItem = { ...item };
        const legacyId = rest.id;
        delete rest.id;
        await target.writeQueue.add({
          ...rest,
          status: rest.status === "syncing" ? "pending" : rest.status,
          principalId: user.userId,
        });
        if (legacyId !== undefined) claimedIds.push(legacyId);
      }
    });

    for (const id of claimedIds) await legacy.writeQueue.delete(id);
    leftoverQueue = await legacy.writeQueue.count();
  } finally {
    legacy.close();
  }
  if (leftoverQueue === 0) await Dexie.delete(legacyName);
}

export async function getLastSyncedAt(): Promise<string | null> {
  if (!db) return null;
  const row = await db.meta.get("lastSyncedAt");
  return row?.value ?? null;
}

export async function setLastSyncedAt(iso: string): Promise<void> {
  if (!db) return;
  await db.meta.put({ key: "lastSyncedAt", value: iso });
}
