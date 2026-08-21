import type { AuthUser } from "@/lib/auth/types";
import { sameIdentity } from "@/lib/auth/permissions";
import type { WriteQueueItem } from "@/offline/db";

export interface LegacyOwnerTables {
  games: Array<{ game_id: string; owner_id?: string; edited_by?: string }>;
  sidebets: Array<{ sidebet_id: string; game_id: string }>;
  paytables: Array<{ paytable_id: string; sidebet_id: string }>;
  feeSchedules: Array<{ schedule_id: string; game_id: string }>;
  sessions: Array<{ session_id: string; owner_id?: string; logged_by?: string }>;
  rounds: Array<{ round_id: string; session_id: string }>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function findById<T>(rows: T[], key: keyof T, id: string): T | undefined {
  return rows.find((row) => row[key] === id);
}

function gameIdentity(game: { owner_id?: string; edited_by?: string } | undefined): { owner_id: string; person: string } | null {
  if (!game) return null;
  return { owner_id: game.owner_id ?? "", person: game.edited_by ?? "" };
}

function cachedRow(item: Pick<WriteQueueItem, "tab" | "targetId">, tables: LegacyOwnerTables): Record<string, unknown> | undefined {
  switch (item.tab) {
    case "games":
      return findById(tables.games, "game_id", item.targetId) as Record<string, unknown> | undefined;
    case "sidebets":
      return findById(tables.sidebets, "sidebet_id", item.targetId) as Record<string, unknown> | undefined;
    case "paytables":
      return findById(tables.paytables, "paytable_id", item.targetId) as Record<string, unknown> | undefined;
    case "feeSchedules":
      return findById(tables.feeSchedules, "schedule_id", item.targetId) as Record<string, unknown> | undefined;
    case "sessions":
      return findById(tables.sessions, "session_id", item.targetId) as Record<string, unknown> | undefined;
    case "rounds":
      return findById(tables.rounds, "round_id", item.targetId) as Record<string, unknown> | undefined;
  }
}

function resolveIdentity(
  item: Pick<WriteQueueItem, "tab" | "targetId" | "payload">,
  tables: LegacyOwnerTables,
): { owner_id: string; person: string } | null {
  const merged = { ...cachedRow(item, tables), ...item.payload };
  switch (item.tab) {
    case "games":
      return { owner_id: asString(merged.owner_id), person: asString(merged.edited_by) };
    case "sessions":
      return { owner_id: asString(merged.owner_id), person: asString(merged.logged_by) };
    case "rounds": {
      const session = findById(tables.sessions, "session_id", asString(merged.session_id));
      return session ? { owner_id: session.owner_id ?? "", person: session.logged_by ?? "" } : null;
    }
    case "sidebets":
      return gameIdentity(findById(tables.games, "game_id", asString(merged.game_id)));
    case "paytables": {
      const sidebet = findById(tables.sidebets, "sidebet_id", asString(merged.sidebet_id));
      return sidebet ? gameIdentity(findById(tables.games, "game_id", sidebet.game_id)) : null;
    }
    case "feeSchedules":
      return gameIdentity(findById(tables.games, "game_id", asString(merged.game_id)));
  }
}

/**
 * Whether a leftover pre-partition queue item should move into this user's Dexie.
 * Admin does not inherit another person's identifiable writes — only unattributed leftovers.
 */
export function queueItemBelongsToUser(
  item: Pick<WriteQueueItem, "tab" | "targetId" | "payload" | "principalId">,
  user: AuthUser,
  tables: LegacyOwnerTables,
): boolean {
  if (user.role === "demo") return false;
  if (item.principalId && item.principalId.toLowerCase() !== user.userId.toLowerCase()) return false;
  if (item.principalId && item.principalId.toLowerCase() === user.userId.toLowerCase()) return true;

  const identity = resolveIdentity(item, tables);
  if (!identity) return user.role === "admin";
  if (identity.owner_id.trim()) return sameIdentity(identity.owner_id, user);
  if (identity.person.trim()) return sameIdentity(identity.person, user);
  return user.role === "admin";
}

export function queueItemMatchesPrincipal(item: { principalId?: string }, principalId: string): boolean {
  return !item.principalId || item.principalId === principalId;
}
