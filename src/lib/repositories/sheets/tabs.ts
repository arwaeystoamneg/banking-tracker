/**
 * Column order below is authoritative (matches CLAUDE.md exactly) with one addition: a trailing
 * `_row_version` column appended after the documented columns on every tab, giving all six tabs
 * uniform optimistic-concurrency conflict detection even where no edited_at column exists.
 * The app reads by header name, not index, so this order is a writing convention, not a hard
 * requirement — but new columns should still be appended at the end so a user reordering columns in
 * Sheets doesn't break anything.
 */
export interface TabConfig {
  tabName: string;
  idField: string;
  headers: string[];
  numberFields: string[];
  nullableNumberFields: string[];
  booleanFields: string[];
}

export const GAMES_TAB: TabConfig = {
  tabName: "Games",
  idField: "game_id",
  headers: [
    "game_id",
    "name",
    "version",
    "casinos",
    "filing",
    "edge_text",
    "edge_pct",
    "verified",
    "exposure_mult",
    "fee_text",
    "rules",
    "settlement_order",
    "notes",
    "edited_by",
    "edited_at",
    "owner_id",
    "_row_version",
  ],
  numberFields: ["edge_pct", "exposure_mult", "_row_version"],
  nullableNumberFields: [],
  booleanFields: ["verified"],
};

export const SIDEBETS_TAB: TabConfig = {
  tabName: "Sidebets",
  idField: "sidebet_id",
  headers: ["sidebet_id", "game_id", "name", "top_payout", "limits", "edge_pct", "verified", "note", "_row_version"],
  numberFields: ["edge_pct", "_row_version"],
  nullableNumberFields: [],
  booleanFields: ["verified"],
};

export const PAYTABLES_TAB: TabConfig = {
  tabName: "Paytables",
  idField: "paytable_id",
  headers: ["paytable_id", "sidebet_id", "ordinal", "outcome", "payout", "_row_version"],
  numberFields: ["ordinal", "_row_version"],
  nullableNumberFields: [],
  booleanFields: [],
};

export const FEE_SCHEDULES_TAB: TabConfig = {
  tabName: "FeeSchedules",
  idField: "schedule_id",
  headers: [
    "schedule_id",
    "casino",
    "game_id",
    "option_label",
    "table_limit",
    "basis",
    "tier_min",
    "tier_max",
    "pd_fee",
    "player_fee",
    "_row_version",
  ],
  numberFields: ["tier_min", "pd_fee", "player_fee", "_row_version"],
  nullableNumberFields: ["tier_max"],
  booleanFields: [],
};

export const SESSIONS_TAB: TabConfig = {
  tabName: "Sessions",
  idField: "session_id",
  headers: [
    "session_id",
    "date",
    "casino",
    "buy_in",
    "buy_out",
    "time_in",
    "time_out",
    "game_id",
    "schedule_option",
    "rounds_banked",
    "action_offered",
    "action_booked",
    "coverage_pct",
    "bonus_action_booked",
    "collection_paid",
    "gross_wl",
    "net_pnl",
    "peak_drawdown",
    "partners",
    "split_terms",
    "notes",
    "logged_by",
    "logged_at",
    "owner_id",
    "_row_version",
  ],
  numberFields: ["buy_in", "_row_version"],
  nullableNumberFields: [
    "buy_out",
    "rounds_banked",
    "action_offered",
    "action_booked",
    "coverage_pct",
    "bonus_action_booked",
    "collection_paid",
    "gross_wl",
    "net_pnl",
    "peak_drawdown",
  ],
  booleanFields: [],
};

export const ROUNDS_TAB: TabConfig = {
  tabName: "Rounds",
  idField: "round_id",
  headers: ["round_id", "session_id", "seq", "tta", "booked", "bonus_action", "fee_tier", "fee_paid", "result", "note", "_row_version"],
  numberFields: ["seq", "tta", "booked", "fee_paid", "result", "_row_version"],
  nullableNumberFields: ["bonus_action"],
  booleanFields: [],
};

export const ALL_TABS = [GAMES_TAB, SIDEBETS_TAB, PAYTABLES_TAB, FEE_SCHEDULES_TAB, SESSIONS_TAB, ROUNDS_TAB];
