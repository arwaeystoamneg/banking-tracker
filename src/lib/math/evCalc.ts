import { Decimal, d } from "@/lib/decimal";
import {
  actionBooked,
  fullKellyBank,
  n0RoundsForSignificance,
  riskOfRuin,
  standardDeviation,
} from "@/lib/math/core";

/**
 * Per-round EV / SD for a banking seat: one base layer plus any number of side-bet layers, with
 * underbanking modeled by settlement order.
 *
 * Two facts from the domain doc drive this:
 *   1. The bank funds `exposureMult` dollars per $1 of action, so it can only book B/m of action
 *      (`actionBooked`, CLAUDE.md).
 *   2. Base wagers settle first and side bets settle last (and in a defined order among themselves).
 *      A short bank therefore backs the base layer first, then each side bet in turn from whatever
 *      bank is left — which is exactly why underbanking forces the PD onto the lowest-edge action.
 *
 * Collection C is charged in full regardless of coverage. Layer variances are summed as independent
 * blocks (a simplification — they share the same hand — flagged in the UI).
 */
export interface EVLayerInput {
  actionOffered: Decimal.Value;
  /** Per-$1 edge, signed, + favors the bank. */
  edge: Decimal.Value;
  /** Bank required per $1 of action to fully cover it. */
  exposureMult: Decimal.Value;
  /** Per-$1 standard deviation of the wager outcome (volatility). */
  sigma: Decimal.Value;
  /** Exact fully-offered moments for games such as baccarat; scaled by booked coverage. */
  exactMoments?: { ev: Decimal.Value; variance: Decimal.Value };
  /** Optional label for UI echo-back. */
  label?: string;
}

export interface EVInput {
  bank: Decimal.Value;
  collection: Decimal.Value;
  base: EVLayerInput;
  sides: EVLayerInput[];
  /** Number of equal betting spots at the table (for the SD aggregation). */
  spots: number;
  /** Cross-seat correlation ρ (estimate). */
  rho: Decimal.Value;
}

export interface EVLayerResult {
  label?: string;
  offered: Decimal;
  booked: Decimal;
  coverage: Decimal; // booked / offered, 1 if nothing offered
  bankUsed: Decimal;
  ev: Decimal;
  sd: Decimal;
  variance: Decimal;
}

export interface EVResult {
  base: EVLayerResult;
  sides: EVLayerResult[];
  bookedTotal: Decimal;
  offeredTotal: Decimal;
  coveragePct: Decimal; // 0..1 across all layers
  fullyBanked: boolean;
  ev: Decimal;
  variance: Decimal;
  sd: Decimal;
  /** Rounds to one SD of expected win = (SD/EV)². Infinity when EV ≤ 0. */
  n0: Decimal;
  /** ≈ exp(−2·EV·B/σ²), clamped to [0,1]. 1 when EV ≤ 0. */
  riskOfRuin: Decimal;
  /** Full-Kelly bank σ²/EV. Infinity when EV ≤ 0. */
  kellyBank: Decimal;
  /** Base-layer breakeven action C/e. */
  breakevenActionBase: Decimal;
}

function layerVariance(booked: Decimal, sigma: Decimal.Value, spots: number, rho: Decimal.Value): Decimal {
  if (booked.lessThanOrEqualTo(0)) return d(0);
  const n = spots > 0 ? spots : 1;
  const perSpot = booked.dividedBy(n);
  return standardDeviation(sigma, perSpot, n, rho).pow(2);
}

function coverageOf(booked: Decimal, offered: Decimal): Decimal {
  return offered.greaterThan(0) ? booked.dividedBy(offered) : d(1);
}

/** Books a layer against whatever bank remains and returns its result plus the bank left afterward. */
function bookLayer(layer: EVLayerInput, availableBank: Decimal, spots: number, rho: Decimal): {
  result: EVLayerResult;
  remainingBank: Decimal;
} {
  const offered = d(layer.actionOffered);
  const booked = actionBooked(offered, availableBank, layer.exposureMult);
  const bankUsed = booked.times(layer.exposureMult);
  const coverage = coverageOf(booked, offered);
  const variance = layer.exactMoments
    ? d(layer.exactMoments.variance).times(coverage.pow(2))
    : layerVariance(booked, layer.sigma, spots, rho);
  const ev = layer.exactMoments ? d(layer.exactMoments.ev).times(coverage) : d(layer.edge).times(booked);
  return {
    result: {
      label: layer.label,
      offered,
      booked,
      coverage,
      bankUsed,
      ev,
      sd: variance.sqrt(),
      variance,
    },
    remainingBank: Decimal.max(d(0), availableBank.minus(bankUsed)),
  };
}

export function computeBankingEV(input: EVInput): EVResult {
  const bank = d(input.bank);
  const collection = d(input.collection);
  const rho = d(input.rho);

  const baseBooking = bookLayer(input.base, bank, input.spots, rho);
  const base = baseBooking.result;

  // Side bets settle last, in order — each gets only the bank left after the ones before it.
  let remaining = baseBooking.remainingBank;
  const sides: EVLayerResult[] = [];
  for (const side of input.sides) {
    const booking = bookLayer(side, remaining, input.spots, rho);
    sides.push(booking.result);
    remaining = booking.remainingBank;
  }

  const sideEv = sides.reduce((acc, s) => acc.plus(s.ev), d(0));
  const sideVar = sides.reduce((acc, s) => acc.plus(s.variance), d(0));
  const ev = base.ev.plus(sideEv).minus(collection);
  const variance = base.variance.plus(sideVar);
  const sd = variance.isNegative() ? d(0) : variance.sqrt();

  const offeredTotal = sides.reduce((acc, s) => acc.plus(s.offered), base.offered);
  const bookedTotal = sides.reduce((acc, s) => acc.plus(s.booked), base.booked);
  const fullyBanked = base.booked.greaterThanOrEqualTo(base.offered) && sides.every((s) => s.booked.greaterThanOrEqualTo(s.offered));

  const positiveEv = ev.greaterThan(0);
  const ruin = variance.isZero()
    ? d(positiveEv ? 0 : 1)
    : Decimal.min(d(1), Decimal.max(d(0), riskOfRuin(ev, bank, variance)));

  return {
    base,
    sides,
    bookedTotal,
    offeredTotal,
    coveragePct: coverageOf(bookedTotal, offeredTotal),
    fullyBanked,
    ev,
    variance,
    sd,
    // N0 is "rounds to one SD of expected win" — undefined once the edge stops winning, so we surface
    // it as infinite for a non-positive EV rather than the finite-but-meaningless (SD/EV)².
    n0: positiveEv ? n0RoundsForSignificance(sd, ev) : d(Infinity),
    riskOfRuin: ruin,
    kellyBank: fullKellyBank(variance, ev),
    breakevenActionBase: d(input.base.edge).isZero() ? d(Infinity) : collection.dividedBy(d(input.base.edge)),
  };
}
