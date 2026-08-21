/**
 * Parses a paytable payout string into the multiple the bank must fund per $1 of that wager. From the
 * bank's side a paytable is a risk-disclosure document: the max multiple is the tail exposure a single
 * hand can hit, and per the domain doc it usually matters more than the named top line.
 *
 * Handles "8000:1", "3:2", "0.95:1", bare "50", and returns null for non-numeric outcomes
 * ("push", "TBD", "Room-specific", "").
 */
export function payoutMultiple(payout: string): number | null {
  const s = payout.trim().toLowerCase();
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
