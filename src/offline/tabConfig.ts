import type { QueueTab } from "@/offline/db";

/** Client-safe mapping from a tab to its REST path and id field — used by the cache + write queue. */
export const TAB_CLIENT_CONFIG: Record<QueueTab, { apiPath: string; idField: string }> = {
  games: { apiPath: "/api/games", idField: "game_id" },
  sidebets: { apiPath: "/api/sidebets", idField: "sidebet_id" },
  paytables: { apiPath: "/api/paytables", idField: "paytable_id" },
  feeSchedules: { apiPath: "/api/fee-schedules", idField: "schedule_id" },
  sessions: { apiPath: "/api/sessions", idField: "session_id" },
  rounds: { apiPath: "/api/rounds", idField: "round_id" },
};
