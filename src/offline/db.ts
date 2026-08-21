import Dexie, { type Table } from "dexie";
import type { FeeSchedule, Game, Paytable, Round, Session, Sidebet } from "@/lib/validation/schemas";

export type QueueOp = "create" | "update" | "delete";
export type QueueStatus = "pending" | "syncing" | "error" | "conflict";
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

  constructor() {
    super("cardroom-banking-tool");
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

// Dexie touches IndexedDB at construction time, which doesn't exist during SSR/server rendering.
export const db: OfflineDatabase | null = typeof window === "undefined" ? null : new OfflineDatabase();

export async function getLastSyncedAt(): Promise<string | null> {
  if (!db) return null;
  const row = await db.meta.get("lastSyncedAt");
  return row?.value ?? null;
}

export async function setLastSyncedAt(iso: string): Promise<void> {
  if (!db) return;
  await db.meta.put({ key: "lastSyncedAt", value: iso });
}
