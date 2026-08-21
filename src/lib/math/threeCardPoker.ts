/**
 * Three Card Poker — California Face-Up Ante/Play plus Pair Plus and 6 Card Bonus.
 *
 * Base game (LA cardrooms): one dealer card up, no Ante Bonus, player must still beat a
 * non-qualifying dealer to win the Ante. Wizard of Odds "Face Up Three Card Poker" analysis
 * (1,221,511,200 equally likely deals, optimal strategy) — house edge 4.30% of Ante, raise
 * rate 49.5%. That figure is of the Ante, not of TTA. Not a transcribed BGC filing.
 *
 * Pair Plus: exact 3-card combinatorics, C(52,3) = 22,100 (Wizard appendix 1). CA filings
 * commonly post Mini Royal 200:1 / SF 40 / trips 30 / straight 6 / flush 3 / pair 1.
 *
 * 6 Card Bonus: best 5-card hand from the player's 3 + dealer 3. Combination counts are
 * Wizard of Odds Version 1 (C(52,6) = 20,358,520). Default paytable is BGC TCP-6B4 /
 * Wizard 1-A (1000/200/100/20/15/10/7, house edge 8.56%).
 *
 * Both side bets are coverage-capped: the bank takes every chip and pays min(felt, cap).
 */

import { payoutMultiple } from "@/lib/payout";
import {
  coverageCap,
  coverageEdgeForSize,
  coverageSigma,
  realizedCoverageEdge,
  type CoverageOutcome,
} from "@/lib/math/coverageBet";

export const THREE_CARD_HANDS = 22100;
export const SIX_CARD_HANDS = 20358520;

export type PairPlusHand = "miniRoyal" | "straightFlush" | "trips" | "straight" | "flush" | "pair";
export type SixCardHand = "royal" | "straightFlush" | "quads" | "fullHouse" | "flush" | "straight" | "trips";

/** Combinations when Mini Royal is split out of straight flush (AKQ suited = 4). */
export const PAIR_PLUS_COMBOS: Record<PairPlusHand, number> = {
  miniRoyal: 4,
  straightFlush: 44,
  trips: 52,
  straight: 720,
  flush: 1096,
  pair: 3744,
};

export const PAIR_PLUS_COMBOS_NO_MINI: Record<PairPlusHand, number> = {
  miniRoyal: 0,
  straightFlush: 48,
  trips: 52,
  straight: 720,
  flush: 1096,
  pair: 3744,
};

/** CA filed Pair Plus (California Grand / BGC): Mini Royal 200, SF 40, trips 30, straight 6, flush 3, pair 1. */
export const PAIR_PLUS_PAYOUTS_CA: Record<PairPlusHand, number> = {
  miniRoyal: 200,
  straightFlush: 40,
  trips: 30,
  straight: 6,
  flush: 3,
  pair: 1,
};

/** Wizard 6-Card Bonus Version 1 combination counts. */
export const SIX_CARD_COMBOS: Record<SixCardHand, number> = {
  royal: 188,
  straightFlush: 1656,
  quads: 14664,
  fullHouse: 165984,
  flush: 205792,
  straight: 361620,
  trips: 732160,
};

/** BGC TCP-6B4 / Wizard 1-A — 8.56% house edge. */
export const SIX_CARD_PAYOUTS_TCP6B4: Record<SixCardHand, number> = {
  royal: 1000,
  straightFlush: 200,
  quads: 100,
  fullHouse: 20,
  flush: 15,
  straight: 10,
  trips: 7,
};

/**
 * California Face-Up Ante/Play, per $1 of Ante, bank's outcome under optimal strategy
 * (Wizard of Odds analysis table). Edge is of the Ante, not of TTA.
 */
export const CA_FACE_UP_ANTE = {
  /** Banker edge per $1 Ante. */
  edge: 0.042964,
  /** Var(bank result) per $1 Ante. */
  variance: 2.475215,
  /** Average (Ante + Play) / Ante. */
  raiseRate: 0.49516,
  /** Max payout on Ante+Play is 1:1 each — $2 per $1 Ante. No Ante Bonus in CA Face-Up. */
  exposureMult: 2,
} as const;

export function pairPlusOutcomes(
  payouts: Record<PairPlusHand, number>,
  combos: Record<PairPlusHand, number> = PAIR_PLUS_COMBOS,
): CoverageOutcome[] {
  const hands: PairPlusHand[] = ["miniRoyal", "straightFlush", "trips", "straight", "flush", "pair"];
  return hands
    .filter((hand) => (payouts[hand] ?? 0) > 0 && (combos[hand] ?? 0) > 0)
    .map((hand) => ({
      id: hand,
      probability: combos[hand] / THREE_CARD_HANDS,
      payout: payouts[hand],
    }));
}

export function sixCardOutcomes(payouts: Record<SixCardHand, number>): CoverageOutcome[] {
  const hands: SixCardHand[] = ["royal", "straightFlush", "quads", "fullHouse", "flush", "straight", "trips"];
  return hands
    .filter((hand) => (payouts[hand] ?? 0) > 0)
    .map((hand) => ({
      id: hand,
      probability: SIX_CARD_COMBOS[hand] / SIX_CARD_HANDS,
      payout: payouts[hand],
    }));
}

export function classifyPairPlusHand(outcome: string): PairPlusHand | null {
  const s = outcome.toLowerCase();
  if (/mini\s*royal|akq|a-k-q|royal/.test(s)) return "miniRoyal";
  if (/straight\s*flush/.test(s)) return "straightFlush";
  if (/three of a kind|3 of a kind|trips/.test(s)) return "trips";
  if (/straight/.test(s)) return "straight";
  if (/flush/.test(s)) return "flush";
  if (/pair/.test(s)) return "pair";
  return null;
}

export function classifySixCardHand(outcome: string): SixCardHand | null {
  const s = outcome.toLowerCase();
  if (/royal/.test(s)) return "royal";
  if (/straight\s*flush/.test(s)) return "straightFlush";
  if (/four of a kind|4 of a kind|quad/.test(s)) return "quads";
  if (/full house|boat/.test(s)) return "fullHouse";
  if (/flush/.test(s)) return "flush";
  if (/straight/.test(s)) return "straight";
  if (/three of a kind|3 of a kind|trips/.test(s)) return "trips";
  return null;
}

export function pairPlusPayoutsFromRows(
  rows: { outcome: string; payout: string }[],
): Record<PairPlusHand, number> | null {
  const map: Record<PairPlusHand, number> = {
    miniRoyal: 0,
    straightFlush: 0,
    trips: 0,
    straight: 0,
    flush: 0,
    pair: 0,
  };
  let recognized = false;
  for (const row of rows) {
    const hand = classifyPairPlusHand(row.outcome);
    const multiple = payoutMultiple(row.payout);
    if (hand && multiple !== null) {
      map[hand] = multiple;
      recognized = true;
    }
  }
  return recognized ? map : null;
}

export function sixCardPayoutsFromRows(
  rows: { outcome: string; payout: string }[],
): Record<SixCardHand, number> | null {
  const map: Record<SixCardHand, number> = {
    royal: 0,
    straightFlush: 0,
    quads: 0,
    fullHouse: 0,
    flush: 0,
    straight: 0,
    trips: 0,
  };
  let recognized = false;
  for (const row of rows) {
    const hand = classifySixCardHand(row.outcome);
    const multiple = payoutMultiple(row.payout);
    if (hand && multiple !== null) {
      map[hand] = multiple;
      recognized = true;
    }
  }
  return recognized ? map : null;
}

export function pairPlusCombosForPayouts(payouts: Record<PairPlusHand, number>): Record<PairPlusHand, number> {
  return (payouts.miniRoyal ?? 0) > 0 ? PAIR_PLUS_COMBOS : PAIR_PLUS_COMBOS_NO_MINI;
}

export function realizedPairPlusEdge(
  payouts: Record<PairPlusHand, number> = PAIR_PLUS_PAYOUTS_CA,
  capMultiple = Infinity,
): number {
  return realizedCoverageEdge(pairPlusOutcomes(payouts, pairPlusCombosForPayouts(payouts)), capMultiple);
}

export function realizedSixCardEdge(
  payouts: Record<SixCardHand, number> = SIX_CARD_PAYOUTS_TCP6B4,
  capMultiple = Infinity,
): number {
  return realizedCoverageEdge(sixCardOutcomes(payouts), capMultiple);
}

export function pairPlusSigma(
  payouts: Record<PairPlusHand, number> = PAIR_PLUS_PAYOUTS_CA,
  capMultiple = Infinity,
): number {
  return coverageSigma(pairPlusOutcomes(payouts, pairPlusCombosForPayouts(payouts)), capMultiple);
}

export function sixCardSigma(
  payouts: Record<SixCardHand, number> = SIX_CARD_PAYOUTS_TCP6B4,
  capMultiple = Infinity,
): number {
  return coverageSigma(sixCardOutcomes(payouts), capMultiple);
}

export function pairPlusEdgeForCoverage(
  bankAvailable: number,
  betSize: number,
  payouts: Record<PairPlusHand, number> = PAIR_PLUS_PAYOUTS_CA,
): number {
  return coverageEdgeForSize(pairPlusOutcomes(payouts, pairPlusCombosForPayouts(payouts)), bankAvailable, betSize);
}

export function sixCardEdgeForCoverage(
  bankAvailable: number,
  betSize: number,
  payouts: Record<SixCardHand, number> = SIX_CARD_PAYOUTS_TCP6B4,
): number {
  return coverageEdgeForSize(sixCardOutcomes(payouts), bankAvailable, betSize);
}

export function pairPlusCap(bankAvailable: number, betSize: number): number {
  return coverageCap(bankAvailable, betSize);
}

export type ThreeCardSidebetKind = "pairPlus" | "sixCard" | "anteBonus";

export function matchThreeCardSidebet(name: string): ThreeCardSidebetKind | null {
  const s = name.toLowerCase();
  if (/6\s*card|six\s*card/.test(s)) return "sixCard";
  if (/pair\s*plus|pairplus/.test(s)) return "pairPlus";
  if (/ante\s*bonus/.test(s)) return "anteBonus";
  // CA filings sometimes label Pair Plus as just "Bonus" — but not "6 Card Bonus".
  if (/^bonus$/.test(s.trim()) || /bonus bet/.test(s)) return "pairPlus";
  return null;
}

export const PAIR_PLUS_BASE_EDGE = realizedPairPlusEdge();
export const SIX_CARD_BASE_EDGE = realizedSixCardEdge();
