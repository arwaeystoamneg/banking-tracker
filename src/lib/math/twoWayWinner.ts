/**
 * Two Way Winner (Hollywood Park, GEGA-004043 / GEGR-001574).
 *
 * Observed rules (Wizard of Vegas floor report + HPC gaming page — not a transcribed filing):
 *   - 53-card deck (joker). Joker is 2 or 12 in blackjack; ace/straight/flush in poker.
 *   - Two forced equal Antes, optional Bonus, then the player's two cards and one dealer upcard.
 *   - Player elects blackjack (Play = 1× Ante) or Hold'em poker (Play = 1× or 2× Ante), or
 *     surrenders one Ante back.
 *   - On a blackjack win the unused poker Ante pushes; a loss takes both Antes.
 *
 * Base-game edge: no closed form. Route election is a free option. Realized edge is leak-driven.
 * The calculator uses +5% of booked Antes+Play as a skill-leak estimate — unverified, not solved.
 *
 * Bonus: Fortune-style 7-card hand from a 53-card deck (C(53,7) = 154,143,080). Combination
 * counts are Wizard of Odds Fortune Pai Gow. Hollywood Park cloth is 5000/750/250/100/50/20/5/4/3/2
 * with no Royal Match line and three pair a loser. To-1 accounting is 9.90% house; treating the
 * same numbers as for-1 (debit $1 on wins too) is 29.09%. Felt prints "to 1". No Envy.
 */

import { payoutMultiple } from "@/lib/payout";
import {
  coverageCap,
  coverageSigma,
  realizedCoverageEdge,
  type CoverageOutcome,
} from "@/lib/math/coverageBet";

export const TWO_WAY_WINNER = {
  /** Two forced equal Antes. */
  antes: 2,
  /**
   * Typical tray reserve: both Antes + 1× Play. Poker 2× Play can need 4; the catalog
   * exposure_mult is the ceiling. Estimate, not solved.
   */
  exposureMult: 3,
  /**
   * Banker edge on booked Antes+Play. Skill-leak estimate — not a solved figure.
   * Do not render as verified.
   */
  edge: 0.05,
} as const;

export type TwoWayBonusHand =
  | "natural7SF"
  | "sevenCardSF"
  | "fiveAces"
  | "royalMatch"
  | "royal"
  | "straightFlush"
  | "quads"
  | "fullHouse"
  | "flush"
  | "trips"
  | "straight";

export const TWO_WAY_BONUS_HANDS: TwoWayBonusHand[] = [
  "natural7SF",
  "sevenCardSF",
  "fiveAces",
  "royalMatch",
  "royal",
  "straightFlush",
  "quads",
  "fullHouse",
  "flush",
  "trips",
  "straight",
];

export const TWO_WAY_BONUS_LABELS: Record<TwoWayBonusHand, string> = {
  natural7SF: "Natural 7-card straight flush",
  sevenCardSF: "Seven-card straight flush",
  fiveAces: "Five aces",
  royalMatch: "Royal flush + royal match",
  royal: "Royal flush",
  straightFlush: "Straight flush",
  quads: "Four of a kind",
  fullHouse: "Full house",
  flush: "Flush",
  trips: "Three of a kind",
  straight: "Straight",
};

/** C(53,7). */
export const TWO_WAY_SEVEN_CARD_HANDS = 154_143_080;

/**
 * Wizard of Odds Fortune Pai Gow combination counts. When Royal Match is not posted,
 * its 72 hands fold into royal (same pattern as Mini Royal → SF on Pair Plus).
 */
export const TWO_WAY_WINNER_BONUS_COMBOS: Record<TwoWayBonusHand, number> = {
  natural7SF: 32,
  sevenCardSF: 196,
  fiveAces: 1128,
  royalMatch: 72,
  royal: 26020,
  straightFlush: 184644,
  quads: 307472,
  fullHouse: 4188528,
  flush: 6172088,
  trips: 7672500,
  straight: 11034204,
};

/** Posted to-1 payouts from the 7-card joker bonus chart. Royal Match is not on that cloth. */
export const TWO_WAY_WINNER_BONUS_PAYOUTS: Record<TwoWayBonusHand, number> = {
  natural7SF: 5000,
  sevenCardSF: 750,
  fiveAces: 250,
  royalMatch: 0,
  royal: 100,
  straightFlush: 50,
  quads: 20,
  fullHouse: 5,
  flush: 4,
  trips: 3,
  straight: 2,
};

export function twoWayWinnerBonusCombosForPayouts(
  payouts: Record<TwoWayBonusHand, number>,
): Record<TwoWayBonusHand, number> {
  if ((payouts.royalMatch ?? 0) > 0) return TWO_WAY_WINNER_BONUS_COMBOS;
  return {
    ...TWO_WAY_WINNER_BONUS_COMBOS,
    royalMatch: 0,
    royal: TWO_WAY_WINNER_BONUS_COMBOS.royal + TWO_WAY_WINNER_BONUS_COMBOS.royalMatch,
  };
}

export interface TwoWayWinnerBonusLine {
  outcome: string;
  payout: number;
}

export function twoWayWinnerBonusLinesFromRows(
  rows: { outcome: string; payout: string }[],
): TwoWayWinnerBonusLine[] {
  const lines: TwoWayWinnerBonusLine[] = [];
  for (const row of rows) {
    const payout = payoutMultiple(row.payout);
    if (payout === null) continue;
    const outcome = row.outcome.trim();
    if (!outcome) continue;
    lines.push({ outcome, payout });
  }
  return lines;
}

/** Natural 7-card SF before joker 7-card SF; royal before SF; flush/straight last. */
export function classifyTwoWayBonusHand(outcome: string): TwoWayBonusHand | null {
  const s = outcome.toLowerCase();
  if (/five\s*aces|5\s*aces/.test(s)) return "fiveAces";
  if (/straight\s*flush/.test(s) && (/natural/.test(s) || /no\s*joker/.test(s))) return "natural7SF";
  if (/straight\s*flush/.test(s) && /7[\s-]*card|seven[\s-]*card/.test(s)) return "sevenCardSF";
  if (/royal/.test(s) && /match/.test(s)) return "royalMatch";
  if (/royal/.test(s)) return "royal";
  if (/straight\s*flush/.test(s)) return "straightFlush";
  if (/four of a kind|4 of a kind|quad/.test(s)) return "quads";
  if (/full house|boat/.test(s)) return "fullHouse";
  if (/flush/.test(s)) return "flush";
  if (/three of a kind|3 of a kind|trips/.test(s)) return "trips";
  if (/straight/.test(s)) return "straight";
  return null;
}

export function twoWayWinnerBonusPayoutsFromRows(
  rows: { outcome: string; payout: string }[],
  defaults: Record<TwoWayBonusHand, number> = TWO_WAY_WINNER_BONUS_PAYOUTS,
): Record<TwoWayBonusHand, number> {
  const map = { ...defaults };
  for (const row of rows) {
    const hand = classifyTwoWayBonusHand(row.outcome);
    const multiple = payoutMultiple(row.payout);
    if (hand && multiple !== null) map[hand] = multiple;
  }
  return map;
}

export function twoWayWinnerBonusOutcomes(
  payouts: Record<TwoWayBonusHand, number> = TWO_WAY_WINNER_BONUS_PAYOUTS,
): CoverageOutcome[] {
  const combos = twoWayWinnerBonusCombosForPayouts(payouts);
  return TWO_WAY_BONUS_HANDS.filter((hand) => (payouts[hand] ?? 0) > 0 && (combos[hand] ?? 0) > 0).map((hand) => ({
    id: hand,
    probability: combos[hand] / TWO_WAY_SEVEN_CARD_HANDS,
    payout: payouts[hand],
  }));
}

export function realizedTwoWayWinnerBonusEdge(
  payouts: Record<TwoWayBonusHand, number> = TWO_WAY_WINNER_BONUS_PAYOUTS,
  capMultiple = Infinity,
): number {
  return realizedCoverageEdge(twoWayWinnerBonusOutcomes(payouts), capMultiple);
}

export function twoWayWinnerBonusSigma(
  payouts: Record<TwoWayBonusHand, number> = TWO_WAY_WINNER_BONUS_PAYOUTS,
  capMultiple = Infinity,
): number {
  return coverageSigma(twoWayWinnerBonusOutcomes(payouts), capMultiple);
}

export function twoWayWinnerBonusCap(bankAvailable: number, betSize: number): number {
  return coverageCap(bankAvailable, betSize);
}

export function twoWayWinnerBonusTop(payouts: Record<TwoWayBonusHand, number>): number {
  return Math.max(...TWO_WAY_BONUS_HANDS.map((hand) => payouts[hand] ?? 0));
}

export function matchTwoWayWinnerBonus(name: string): boolean {
  const s = name.toLowerCase();
  if (/fortune/.test(s)) return false;
  return /bonus/.test(s);
}

export function matchFortuneBonus(name: string): boolean {
  return /fortune/.test(name.toLowerCase());
}

/** Wizard Fortune pay table 2 (most common). Three pair loses. Envy is not included. */
export const FORTUNE_PAI_GOW_PAYOUTS: Record<TwoWayBonusHand, number> = {
  natural7SF: 8000,
  sevenCardSF: 1000,
  fiveAces: 400,
  royalMatch: 2000,
  royal: 150,
  straightFlush: 50,
  quads: 25,
  fullHouse: 5,
  flush: 4,
  trips: 3,
  straight: 2,
};

export const TWO_WAY_WINNER_BONUS_BASE_EDGE = realizedTwoWayWinnerBonusEdge();
export const FORTUNE_PAI_GOW_BASE_EDGE = realizedTwoWayWinnerBonusEdge(FORTUNE_PAI_GOW_PAYOUTS);
