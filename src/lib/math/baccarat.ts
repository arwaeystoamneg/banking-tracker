import { Decimal, d } from "@/lib/decimal";

/**
 * Closed-form baccarat edge/variance from CLAUDE.md. Use this rather than simulating.
 * 8-deck constants — do not re-derive.
 */
export const BACCARAT_CONSTANTS = {
  pBankerWin: 0.458597,
  pPlayerWin: 0.446247,
  pTie: 0.095156,
  pBanker3Card7: 0.02246,
} as const;

const E_COEFF_P = d("0.02246");
const E_COEFF_D = d("0.01011");
const VAR_COEFF_D2 = d("0.882384");
const VAR_COEFF_P2 = d("0.02246");

/** E[X] = 0.02246*p - 0.01011*d, where d = p - b (p = Player-line action, b = Banker-line action). */
export function baccaratExpectedValue(p: Decimal.Value, b: Decimal.Value): Decimal {
  const pD = d(p);
  const bD = d(b);
  const diff = pD.minus(bD);
  return E_COEFF_P.times(pD).minus(E_COEFF_D.times(diff));
}

/** Var[X] = 0.882384*d^2 + 0.02246*p^2 - E[X]^2 */
export function baccaratVariance(p: Decimal.Value, b: Decimal.Value): Decimal {
  const pD = d(p);
  const bD = d(b);
  const diff = pD.minus(bD);
  const ev = baccaratExpectedValue(pD, bD);
  return VAR_COEFF_D2.times(diff.pow(2)).plus(VAR_COEFF_P2.times(pD.pow(2))).minus(ev.pow(2));
}

export function baccaratStandardDeviation(p: Decimal.Value, b: Decimal.Value): Decimal {
  const variance = baccaratVariance(p, b);
  return variance.isNegative() ? d(0) : variance.sqrt();
}
