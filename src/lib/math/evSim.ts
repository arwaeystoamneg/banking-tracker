/**
 * Monte Carlo session simulator for a banking seat.
 *
 * Why simulate at all, when EV per round is just Σ(edge·bookedAction) − fee? Because the *distribution*
 * isn't: with a finite bank over a finite session, what matters operationally is risk of ruin, drawdown,
 * and the spread of outcomes — none of which the per-round mean/SD give you directly. The sim also
 * validates the analytic EV (they should agree) as a consistency check.
 *
 * Model, stated plainly so nothing here is mistaken for solved:
 *   - Coverage/underbanking is resolved once (fixed bet sizes ⇒ deterministic booked action): base is
 *     funded first, then each side bet in order from the remaining bank. Only booked action is played,
 *     and because the exposure multiple already reserves the max payout, booked bets never cause an
 *     intra-round settlement shortfall — so the sim's job is purely the outcome distribution.
 *   - Each booked layer's per-round result is drawn Normal(edge·booked, SD²), with SD from the n-spot /
 *     ρ formula. This is a NORMAL APPROXIMATION — it understates the fat right tail of rare high-payout
 *     side bets (we don't have their outcome probabilities, and must not invent them). Flagged in the UI.
 *   - Cross-round draws are independent. Ruin = bankroll (bank + cumulative P&L) touching ≤ 0.
 */

export interface SimLayer {
  /** Action actually booked this round (already coverage-resolved by the caller). */
  booked: number;
  /** Per-$1 edge, signed. */
  edge: number;
  /** Per-$1 SD. */
  sigma: number;
}

export interface SimInput {
  bank: number;
  collection: number;
  layers: SimLayer[];
  spots: number;
  rho: number;
  sessions: number;
  roundsPerSession: number;
  seed?: number;
}

export interface SimResult {
  rounds: number;
  evPerRound: number;
  sdPerRound: number;
  /** Fraction of sessions whose bankroll touched ≤ 0 at any point. */
  riskOfRuin: number;
  medianSessionPnl: number;
  p5SessionPnl: number;
  p95SessionPnl: number;
  /** Median of each session's worst peak-to-trough bankroll drawdown. */
  medianMaxDrawdown: number;
}

/** Deterministic PRNG (mulberry32) so a given seed reproduces the same run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller. */
function makeGaussian(rand: () => number): () => number {
  return () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

/** SD of a layer's total round result: σ·(booked/n)·√(n[1+ρ(n−1)]) = σ·booked·√([1+ρ(n−1)]/n). */
function layerSd(layer: SimLayer, spots: number, rho: number): number {
  if (layer.booked <= 0) return 0;
  const n = spots > 0 ? spots : 1;
  // Guard the radicand: a correlation below −1/(n−1) is not a valid covariance and would make the
  // variance go imaginary (NaN) and poison every downstream draw. Clamp it to 0 instead.
  const inner = Math.max(0, (1 + rho * (n - 1)) / n);
  return layer.sigma * layer.booked * Math.sqrt(inner);
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1))));
  return sortedAsc[idx];
}

export function simulateSessions(input: SimInput): SimResult {
  const rand = mulberry32(input.seed ?? 0x1234abcd);
  const gaussian = makeGaussian(rand);

  const layerParams = input.layers
    .filter((l) => l.booked > 0)
    .map((l) => ({ mean: l.edge * l.booked, sd: layerSd(l, input.spots, input.rho) }));

  const sessionPnls: number[] = [];
  const maxDrawdowns: number[] = [];
  let ruinCount = 0;

  // Round-level accumulators (Welford) across every simulated round, for EV/SD per round.
  let count = 0;
  let mean = 0;
  let m2 = 0;

  for (let s = 0; s < input.sessions; s += 1) {
    let bankroll = input.bank;
    let peak = input.bank;
    let maxDrawdown = 0;
    let ruined = false;

    for (let r = 0; r < input.roundsPerSession; r += 1) {
      let roundResult = -input.collection;
      for (const lp of layerParams) roundResult += lp.mean + lp.sd * gaussian();

      // Welford update for per-round mean/variance.
      count += 1;
      const delta = roundResult - mean;
      mean += delta / count;
      m2 += delta * (roundResult - mean);

      bankroll += roundResult;
      if (bankroll > peak) peak = bankroll;
      const drawdown = peak - bankroll;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      if (bankroll <= 0) ruined = true;
    }

    sessionPnls.push(bankroll - input.bank);
    maxDrawdowns.push(maxDrawdown);
    if (ruined) ruinCount += 1;
  }

  sessionPnls.sort((a, b) => a - b);
  maxDrawdowns.sort((a, b) => a - b);

  return {
    rounds: count,
    evPerRound: mean,
    sdPerRound: count > 1 ? Math.sqrt(m2 / (count - 1)) : 0,
    riskOfRuin: input.sessions > 0 ? ruinCount / input.sessions : 0,
    medianSessionPnl: percentile(sessionPnls, 50),
    p5SessionPnl: percentile(sessionPnls, 5),
    p95SessionPnl: percentile(sessionPnls, 95),
    medianMaxDrawdown: percentile(maxDrawdowns, 50),
  };
}
