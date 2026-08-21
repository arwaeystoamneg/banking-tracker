/**
 * Parses a paytable payout string into the multiple the bank must fund per $1 of that wager. From the
 * bank's side a paytable is a risk-disclosure document: the max multiple is the tail exposure a single
 * hand can hit, and per the domain doc it usually matters more than the named top line.
 *
 * Handles "8000:1", "3:2", "0.95:1", bare "50", and returns null for non-numeric outcomes
 * ("push", "TBD", "Room-specific", "").
 */
export function payoutMultiple(payout: string): number | null {
  // Strip thousands separators so "7,500" and "1,000:1" parse (values are entered by hand on a phone).
  const s = payout.trim().toLowerCase().replace(/,/g, "");
  if (!s) return null;

  const ratio = s.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (ratio) {
    const numerator = parseFloat(ratio[1]);
    const denominator = parseFloat(ratio[2]);
    return denominator > 0 ? numerator / denominator : null;
  }

  const bare = s.match(/^(\d+(?:\.\d+)?)\s*(?::\s*1)?$/);
  if (bare) return parseFloat(bare[1]);

  return null;
}

/** Largest funded multiple across a set of payout strings — the side bet's worst-case tail per $1. */
export function maxPayoutMultiple(payouts: string[]): number | null {
  let max: number | null = null;
  for (const p of payouts) {
    const m = payoutMultiple(p);
    if (m !== null && (max === null || m > max)) max = m;
  }
  return max;
}

/**
 * True for a line that is not yet a real paytable row: blank, TBD, or an explicit placeholder.
 * "push" is a real outcome and is not treated as a placeholder.
 */
export function isPlaceholderPaytableLine(outcome: string, payout: string): boolean {
  const o = outcome.trim().toLowerCase();
  const p = payout.trim().toLowerCase();
  if (!o || !p) return true;
  if (o.includes("placeholder") || o.includes("not yet entered")) return true;
  if (p === "tbd" || o === "tbd") return true;
  return false;
}
