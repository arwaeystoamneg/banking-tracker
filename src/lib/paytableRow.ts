import type { Paytable } from "@/lib/validation/schemas";

/**
 * Recovers a paytable sheet row that fails the strict schema (empty outcome, NaN ordinal, etc.)
 * so it still appears in the grid and can be deleted. Rows with no id are blank and skipped.
 */
export function salvagePaytableRow(raw: Record<string, unknown>): Paytable | null {
  const id = String(raw.paytable_id ?? "").trim();
  if (!id) return null;
  const version = Number(raw._row_version);
  const ordinal = Number(raw.ordinal);
  return {
    paytable_id: id,
    sidebet_id: String(raw.sidebet_id ?? ""),
    ordinal: Number.isFinite(ordinal) ? Math.trunc(ordinal) : 0,
    outcome: String(raw.outcome ?? "").trim() || "(invalid)",
    payout: String(raw.payout ?? ""),
    _row_version: Number.isInteger(version) && version > 0 ? version : 1,
  };
}

/** Stored `_row_version` is usable for optimistic concurrency. Garbage values are cleanup deletes. */
export function rowVersionMatches(stored: unknown, expected: number): boolean {
  const n = Number(stored);
  if (!Number.isInteger(n) || n <= 0) return true;
  return n === expected;
}