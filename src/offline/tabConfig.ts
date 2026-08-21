import type { CacheTab, QueueTab } from "@/offline/db";

/** Client-safe mapping from a tab to its REST path and id field — used by the cache + write queue. */
export const TAB_CLIENT_CONFIG: Record<CacheTab, { apiPath: string; idField: string }> = {
  games: { apiPath: "/api/games", idField: "game_id" },
  sidebets: { apiPath: "/api/sidebets", idField: "sidebet_id" },
  paytables: { apiPath: "/api/paytables", idField: "paytable_id" },
  feeSchedules: { apiPath: "/api/fee-schedules", idField: "schedule_id" },
  sessions: { apiPath: "/api/sessions", idField: "session_id" },
  rounds: { apiPath: "/api/rounds", idField: "round_id" },
  lossReports: { apiPath: "/api/losses", idField: "loss_id" },
  lossEvidence: { apiPath: "/api/evidence", idField: "evidence_id" },
  auditLog: { apiPath: "/api/audit", idField: "entry_id" },
};

export const QUEUE_TAB_CONFIG: Record<QueueTab, { apiPath: string; idField: string }> = {
  games: TAB_CLIENT_CONFIG.games,
  sidebets: TAB_CLIENT_CONFIG.sidebets,
  paytables: TAB_CLIENT_CONFIG.paytables,
  feeSchedules: TAB_CLIENT_CONFIG.feeSchedules,
  sessions: TAB_CLIENT_CONFIG.sessions,
  rounds: TAB_CLIENT_CONFIG.rounds,
};

export function isQueueTab(tab: CacheTab): tab is QueueTab {
  return Object.hasOwn(QUEUE_TAB_CONFIG, tab);
}
