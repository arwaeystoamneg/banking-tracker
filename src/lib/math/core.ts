import { Decimal, d } from "@/lib/decimal";

/** A = min(TTA_offered, B / m) */
export function actionBooked(ttaOffered: Decimal.Value, bank: Decimal.Value, exposureMult: Decimal.Value): Decimal {
  const capacity = d(bank).dividedBy(d(exposureMult));
  return Decimal.min(d(ttaOffered), capacity);
}

/** EV per round = e*A - C. C does not scale with coverage. */
export function evPerRound(edge: Decimal.Value, action: Decimal.Value, collection: Decimal.Value): Decimal {
  return d(edge).times(d(action)).minus(d(collection));
}

/** Breakeven action A* = C / e */
export function breakevenAction(collection: Decimal.Value, edge: Decimal.Value): Decimal {
  const edgeD = d(edge);
  if (edgeD.isZero()) return d(Infinity);
  return d(collection).dividedBy(edgeD);
}

/** SD, n equal spots = sigma * w * sqrt( n * [1 + rho*(n-1)] ) */
export function standardDeviation(sigma: Decimal.Value, w: Decimal.Value, n: number, rho: Decimal.Value): Decimal {
  const inner = d(n).times(d(1).plus(d(rho).times(d(n - 1))));
  return d(sigma).times(d(w)).times(inner.sqrt());
}

/** N0 = (SD / EV)^2 — rounds to one SD of expected win. */
export function n0RoundsForSignificance(sd: Decimal.Value, ev: Decimal.Value): Decimal {
  const evD = d(ev);
  if (evD.isZero()) return d(Infinity);
  return d(sd).dividedBy(evD).pow(2);
}

/** full-Kelly bank B* = sigma^2 / EV */
export function fullKellyBank(sigmaSq: Decimal.Value, ev: Decimal.Value): Decimal {
  const evD = d(ev);
  if (evD.isZero() || evD.isNegative()) return d(Infinity);
  return d(sigmaSq).dividedBy(evD);
}

/** risk of ruin ~= exp( -2*EV*B / sigma^2 ) */
export function riskOfRuin(ev: Decimal.Value, bank: Decimal.Value, sigmaSq: Decimal.Value): Decimal {
  const sigmaSqD = d(sigmaSq);
  if (sigmaSqD.isZero()) return d(0);
  const exponent = d(-2).times(d(ev)).times(d(bank)).dividedBy(sigmaSqD);
  return Decimal.exp(exponent);
}

/**
 * t-statistic for "is the realized result distinguishable from zero edge yet."
 * t = actualResult / (sdPerRound * sqrt(nRounds))
 * Not given verbatim in CLAUDE.md's Math section — this is the standard interpretation of the
 * doc's "under |t| ~= 2, show as not yet meaningful" guardrail for feature 5 (roll-ups).
 */
export function tStatistic(actualResult: Decimal.Value, sdPerRound: Decimal.Value, nRounds: number): Decimal {
  const sdD = d(sdPerRound);
  if (nRounds <= 0 || sdD.isZero()) return d(0);
  const denom = sdD.times(d(nRounds).sqrt());
  if (denom.isZero()) return d(0);
  return d(actualResult).dividedBy(denom);
}

export const SIGNIFICANCE_T_THRESHOLD = d(2);

export function isStatisticallyMeaningful(t: Decimal.Value): boolean {
  return d(t).abs().greaterThanOrEqualTo(SIGNIFICANCE_T_THRESHOLD);
}
