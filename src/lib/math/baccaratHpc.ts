/**
 * Hollywood Park baccarat extras (Golden Frog-style 9/1, 9/7, 8/6).
 *
 * Standard published pays (Wizard of Odds, 8-deck):
 *   8/6  — any 8 beats any 6, 25:1, house 21.79%
 *   9/7  — 2-card 9 beats 2-card 7, 50:1, house 8.10%
 *   9/1  — 3-card 9 beats 3-card 1, 150:1, house 13.87%
 *
 * HPC cloth short-pays 9/7 at 30:1 and 9/1 at 100:1. 8/6 stays 25:1.
 * 9/7 at 30:1 is 44.14% house — that's the unreconciled "44%" figure.
 *
 * Player / Banker / Tie / Dragon / Panda are the usual EZ lines. Tie is a main-style
 * proposition here the same as the generic calculator. Coverage-capped like Pair Plus.
 */

import { payoutMultiple } from "@/lib/payout";
import {
  coverageCap,
  coverageSigma,
  realizedCoverageEdge,
  type CoverageOutcome,
} from "@/lib/math/coverageBet";

export type HpcFrogBet = "eightSix" | "nineSeven" | "nineOne";

/** Wizard of Odds Golden Frog, 8-deck. */
export const HPC_FROG_PROBABILITY: Record<HpcFrogBet, number> = {
  eightSix: 0.030081,
  nineSeven: 0.018019,
  nineOne: 0.005704,
};

/** Common published pays. */
export const HPC_FROG_PAYOUTS_STANDARD: Record<HpcFrogBet, number> = {
  eightSix: 25,
  nineSeven: 50,
  nineOne: 150,
};

/** Hollywood Park cloth. */
export const HPC_FROG_PAYOUTS: Record<HpcFrogBet, number> = {
  eightSix: 25,
  nineSeven: 30,
  nineOne: 100,
};

export const HPC_FROG_LABEL: Record<HpcFrogBet, string> = {
  eightSix: "8/6",
  nineSeven: "9/7",
  nineOne: "9/1",
};

function outcomes(kind: HpcFrogBet, payout: number): CoverageOutcome[] {
  return [{ id: kind, probability: HPC_FROG_PROBABILITY[kind], payout }];
}

export function realizedHpcFrogEdge(kind: HpcFrogBet, payout: number, capMultiple = Infinity): number {
  return realizedCoverageEdge(outcomes(kind, payout), capMultiple);
}

export function hpcFrogSigma(kind: HpcFrogBet, payout: number, capMultiple = Infinity): number {
  return coverageSigma(outcomes(kind, payout), capMultiple);
}

export function hpcFrogCap(bankAvailable: number, betSize: number): number {
  return coverageCap(bankAvailable, betSize);
}

export const HPC_FROG_STANDARD_EDGE: Record<HpcFrogBet, number> = {
  eightSix: realizedHpcFrogEdge("eightSix", HPC_FROG_PAYOUTS_STANDARD.eightSix),
  nineSeven: realizedHpcFrogEdge("nineSeven", HPC_FROG_PAYOUTS_STANDARD.nineSeven),
  nineOne: realizedHpcFrogEdge("nineOne", HPC_FROG_PAYOUTS_STANDARD.nineOne),
};

export const HPC_FROG_EDGE: Record<HpcFrogBet, number> = {
  eightSix: realizedHpcFrogEdge("eightSix", HPC_FROG_PAYOUTS.eightSix),
  nineSeven: realizedHpcFrogEdge("nineSeven", HPC_FROG_PAYOUTS.nineSeven),
  nineOne: realizedHpcFrogEdge("nineOne", HPC_FROG_PAYOUTS.nineOne),
};

export function matchHpcFrogSidebet(name: string): HpcFrogBet | null {
  const s = name.toLowerCase();
  if (/8\s*[/\-]\s*6|8\s*over\s*6|8\s*beats\s*6/.test(s)) return "eightSix";
  if (/9\s*[/\-]\s*1|9\s*over\s*1|9\s*beats\s*1|3[\s-]*card\s*9.*1/.test(s)) return "nineOne";
  if (/9\s*[/\-]\s*7|9\s*over\s*7|9\s*beats\s*7|2[\s-]*card\s*9.*7/.test(s)) return "nineSeven";
  return null;
}

export function hpcFrogPayoutFromRows(
  kind: HpcFrogBet,
  rows: { outcome: string; payout: string }[],
  fallback = HPC_FROG_PAYOUTS[kind],
): number {
  for (const row of rows) {
    if (matchHpcFrogSidebet(row.outcome) !== kind) continue;
    const multiple = payoutMultiple(row.payout);
    if (multiple !== null) return multiple;
  }
  if (rows.length === 1) {
    const multiple = payoutMultiple(rows[0]!.payout);
    if (multiple !== null) return multiple;
  }
  return fallback;
}
