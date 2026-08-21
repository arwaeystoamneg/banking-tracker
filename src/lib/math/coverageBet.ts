/**
 * Coverage-capped bank edge for any discrete-outcome wager.
 *
 * The bank takes every posted chip and pays min(felt payout, cap) on a hit, where
 * cap = bank left for this bet / $1 of action after earlier settlement. A tighter cap
 * (heavier underbanking) raises the bank's edge because it keeps the shortfall on a win.
 * cap = ∞ is the fully-banked house edge.
 *
 * Shared accounting only. Each game still needs its own probabilities, paytables, and
 * EV-page wiring (baccaratBets, uthBadBeat). Blackjack and 2WW will too.
 *
 * Outcomes list the non-lose branches. Lose probability is 1 − Σ p. A push is an
 * outcome with payout 0 (stake returned; contributes neither to the win total nor to lose).
 */

export interface CoverageOutcome {
  id: string;
  probability: number;
  /** To-1 payout. 0 = push. */
  payout: number;
}

export function coverageCap(bankAvailable: number, betSize: number): number {
  if (betSize <= 0) return Infinity;
  return Math.max(0, bankAvailable) / betSize;
}

/** Realized bank edge per $1. cap ≤ 0 → every win pays 0 (stake pushes), edge → P(lose). */
export function realizedCoverageEdge(outcomes: CoverageOutcome[], capMultiple: number): number {
  const cap = Math.max(0, capMultiple);
  let listed = 0;
  let grossWin = 0;
  for (const outcome of outcomes) {
    listed += outcome.probability;
    grossWin += outcome.probability * Math.min(Math.max(0, outcome.payout), cap);
  }
  return 1 - listed - grossWin;
}

/** Per-$1 SD of the bank outcome: +1 lose, 0 push, −min(payout, cap) win. */
export function coverageSigma(outcomes: CoverageOutcome[], capMultiple = Infinity): number {
  const cap = Math.max(0, capMultiple);
  let listed = 0;
  let firstMoment = 0;
  let secondMoment = 0;
  for (const outcome of outcomes) {
    listed += outcome.probability;
    const pay = Math.min(Math.max(0, outcome.payout), cap);
    firstMoment += outcome.probability * pay;
    secondMoment += outcome.probability * pay * pay;
  }
  const loseProb = 1 - listed;
  const mean = firstMoment - loseProb;
  const meanSquare = secondMoment + loseProb;
  return Math.sqrt(Math.max(0, meanSquare - mean * mean));
}

export function coverageEdgeForSize(
  outcomes: CoverageOutcome[],
  bankAvailable: number,
  betSize: number,
): number {
  if (betSize <= 0) return realizedCoverageEdge(outcomes, Infinity);
  return realizedCoverageEdge(outcomes, coverageCap(bankAvailable, betSize));
}

/** Top to-1 line in a set of outcomes (for the "covers ×N of X:1" label). */
export function coverageTopPayout(outcomes: CoverageOutcome[]): number {
  let top = 0;
  for (const outcome of outcomes) if (outcome.payout > top) top = outcome.payout;
  return top;
}
