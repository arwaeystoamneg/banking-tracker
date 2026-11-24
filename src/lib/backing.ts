import { d, type Decimal } from "@/lib/decimal";

/**
 * Who backs a session or a reimbursement, and by how much. Stored in the `backing` column as
 * "Ray Tang:80|Damon:20" — readable and hand-editable in the sheet. Blank = unassigned.
 *
 * A backer is anyone: a teammate (by name) or an outside backer typed in. The player can hold a share of
 * their own session; backers then split 100% of that session's pay by share, so a player's own share pays
 * that part of their own wage (it nets out).
 */
export interface BackingShare {
  name: string;
  /** Percent, 0 < pct ≤ 100. Shares add up to 100. */
  pct: number;
}

export const UNASSIGNED = "Unassigned";

/** Parses the column. Returns [] for blank; skips malformed pieces (a hand edit) rather than throwing. */
export function parseBacking(text: string | undefined | null): BackingShare[] {
  if (!text?.trim()) return [];
  const shares: BackingShare[] = [];
  for (const piece of text.split("|")) {
    const at = piece.lastIndexOf(":");
    if (at <= 0) continue;
    const name = piece.slice(0, at).trim().replace(/\s+/g, " ");
    const pct = Number(piece.slice(at + 1).replace("%", "").trim());
    if (name && Number.isFinite(pct) && pct > 0) shares.push({ name, pct });
  }
  return shares;
}

export function formatBacking(shares: BackingShare[]): string {
  return shares.map((share) => `${share.name.trim().replace(/[|:]/g, " ")}:${round2(share.pct)}`).join("|");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Why a split can't be saved, or null if it's fine. Blank (no shares) is fine: it means unassigned. */
export function backingProblem(shares: BackingShare[]): string | null {
  if (shares.length === 0) return null;
  const names = new Set<string>();
  let total = 0;
  for (const share of shares) {
    if (!share.name.trim()) return "Every share needs a name";
    if (!(share.pct > 0) || share.pct > 100) return "Each share must be more than 0% and at most 100%";
    const key = share.name.trim().toLowerCase();
    if (names.has(key)) return `${share.name} is listed twice`;
    names.add(key);
    total += share.pct;
  }
  if (Math.abs(total - 100) > 0.01) return `Shares add up to ${round2(total)}%, not 100%`;
  return null;
}

/** Normalizes a stored split to canonical text, or throws a readable message. Blank stays blank. */
export function normalizeBacking(text: string): string {
  const shares = parseBacking(text);
  if (text.trim() && shares.length === 0) throw new Error("Couldn't read the split (use Name:percent|Name:percent)");
  const problem = backingProblem(shares);
  if (problem) throw new Error(problem);
  return formatBacking(shares);
}

/**
 * Splits an amount by the shares, to the cent, with any rounding cent going to the largest share so the
 * pieces add back up exactly. Unassigned (no shares) puts it all under UNASSIGNED.
 */
export function splitAmount(amount: Decimal.Value, backing: string | BackingShare[]): Map<string, Decimal> {
  const shares = typeof backing === "string" ? parseBacking(backing) : backing;
  const total = d(amount);
  const out = new Map<string, Decimal>();
  if (shares.length === 0 || backingProblem(shares)) {
    out.set(UNASSIGNED, total);
    return out;
  }
  let assigned = d(0);
  for (const share of shares) {
    const piece = total.times(share.pct).dividedBy(100).toDecimalPlaces(2);
    out.set(share.name, piece);
    assigned = assigned.plus(piece);
  }
  const largest = shares.reduce((best, share) => (share.pct > best.pct ? share : best), shares[0]);
  out.set(largest.name, out.get(largest.name)!.plus(total.minus(assigned)));
  return out;
}

/** Adds one split into a running per-backer total. */
export function addSplit(into: Map<string, Decimal>, amount: Decimal.Value, backing: string): void {
  for (const [name, piece] of splitAmount(amount, backing)) into.set(name, (into.get(name) ?? d(0)).plus(piece));
}

/** "Ray 80% · Damon 20%", or "Unassigned". */
export function describeBacking(backing: string): string {
  const shares = parseBacking(backing);
  return shares.length ? shares.map((share) => `${share.name} ${round2(share.pct)}%`).join(" · ") : UNASSIGNED;
}

/** Per-backer totals, largest first, Unassigned last. */
export function sortedTotals(totals: Map<string, Decimal>): { name: string; amount: Decimal }[] {
  return [...totals.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .filter((row) => !row.amount.isZero())
    .sort((a, b) => Number(a.name === UNASSIGNED) - Number(b.name === UNASSIGNED) || b.amount.comparedTo(a.amount));
}
