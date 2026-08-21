import { Decimal, d } from "@/lib/decimal";
import { isStatisticallyMeaningful, tStatistic } from "@/lib/math/core";
import type { Round } from "@/lib/validation/schemas";

export interface RollupResult {
  roundCount: number;
  actionOffered: Decimal;
  actionBooked: Decimal;
  coveragePct: Decimal | null;
  grossWl: Decimal;
  collectionPaid: Decimal;
  netPnl: Decimal;
  realizedEdgePct: Decimal | null; // gross W/L as a % of action booked
  feeLoadPct: Decimal | null; // collection as a % of action booked
  netEdgePct: Decimal | null; // realized edge minus fee load
  dollarPerRound: Decimal | null;
  sdPerRound: Decimal;
  tStat: Decimal;
  isMeaningful: boolean;
}

/**
 * Rolls up realized results from actual logged rounds — deliberately uses the *sample* standard
 * deviation of observed per-round net results (not the theoretical baccarat closed form), because
 * this is meant to separate realized edge from fee drag using what actually happened at the table.
 * Feature 5's guardrail: under |t| ~= 2, the UI must show "not yet meaningful," never a bare number.
 */
export function computeRollup(rounds: Round[]): RollupResult {
  const n = rounds.length;
  const actionOffered = rounds.reduce((sum, r) => sum.plus(d(r.tta)), d(0));
  const actionBooked = rounds.reduce((sum, r) => sum.plus(d(r.booked)), d(0));
  const grossWl = rounds.reduce((sum, r) => sum.plus(d(r.result)), d(0));
  const collectionPaid = rounds.reduce((sum, r) => sum.plus(d(r.fee_paid)), d(0));
  const netPnl = grossWl.minus(collectionPaid);

  const coveragePct = actionOffered.isZero() ? null : actionBooked.dividedBy(actionOffered);
  const realizedEdgePct = actionBooked.isZero() ? null : grossWl.dividedBy(actionBooked);
  const feeLoadPct = actionBooked.isZero() ? null : collectionPaid.dividedBy(actionBooked);
  const netEdgePct = actionBooked.isZero() ? null : netPnl.dividedBy(actionBooked);
  const dollarPerRound = n === 0 ? null : netPnl.dividedBy(n);

  let sdPerRound = d(0);
  if (n > 1) {
    const mean = netPnl.dividedBy(n);
    const sumSquaredDiffs = rounds.reduce((sum, r) => {
      const net = d(r.result).minus(d(r.fee_paid));
      return sum.plus(net.minus(mean).pow(2));
    }, d(0));
    sdPerRound = sumSquaredDiffs.dividedBy(n - 1).sqrt();
  }

  const tStat = tStatistic(netPnl, sdPerRound, n);
  const isMeaningful = n > 1 && isStatisticallyMeaningful(tStat);

  return {
    roundCount: n,
    actionOffered,
    actionBooked,
    coveragePct,
    grossWl,
    collectionPaid,
    netPnl,
    realizedEdgePct,
    feeLoadPct,
    netEdgePct,
    dollarPerRound,
    sdPerRound,
    tStat,
    isMeaningful,
  };
}
