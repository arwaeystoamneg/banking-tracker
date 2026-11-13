import { coverageSigma, realizedCoverageEdge, type CoverageOutcome } from "@/lib/math/coverageBet";
import { classifyBadBeatHand, TRIPS_PAYOUTS_BY_BADBEAT } from "@/lib/math/uthBadBeat";
import { payoutMultiple } from "@/lib/payout";

/**
 * UTH Trips: pays on the player's best five of seven (2 hole + 5 board), win or lose against the dealer.
 * Exact frequencies of each best hand over all C(52,7) = 133,784,560 seven-card hands — a counting fact,
 * not an estimate. With the standard 50-40-30-8-6-5-3 table this gives the published 1.90% house edge.
 */
export const SEVEN_CARD_HANDS = 133_784_560;

export type TripsHand = "royal" | "straightFlush" | "quads" | "fullHouse" | "flush" | "straight" | "trips";

export const TRIPS_HANDS: TripsHand[] = ["royal", "straightFlush", "quads", "fullHouse", "flush", "straight", "trips"];

export const SEVEN_CARD_COMBOS: Record<TripsHand, number> = {
  royal: 4_324,
  straightFlush: 37_260,
  quads: 224_848,
  fullHouse: 3_473_184,
  flush: 4_047_644,
  straight: 6_180_020,
  trips: 6_461_620,
};

export const TRIPS_LABELS: Record<TripsHand, string> = {
  royal: "Royal flush",
  straightFlush: "Straight flush",
  quads: "Four of a kind",
  fullHouse: "Full house",
  flush: "Flush",
  straight: "Straight",
  trips: "Three of a kind",
};

/** Trips payouts from the felt. A table that doesn't list a royal pays it as a straight flush. Null with no usable rows. */
export function uthTripsPayoutsFromRows(rows: { outcome: string; payout: string }[]): Record<TripsHand, number> | null {
  const out: Partial<Record<TripsHand, number>> = {};
  for (const row of rows) {
    const payout = payoutMultiple(row.payout);
    if (payout === null || payout <= 0) continue;
    if (/royal/i.test(row.outcome)) {
      out.royal = payout;
      continue;
    }
    const category = classifyBadBeatHand(row.outcome);
    if (category) out[category] = payout;
  }
  if (Object.keys(out).length === 0) return null;
  const fallback = TRIPS_PAYOUTS_BY_BADBEAT;
  const straightFlush = out.straightFlush ?? fallback.straightFlush;
  return {
    royal: out.royal ?? straightFlush,
    straightFlush,
    quads: out.quads ?? 0,
    fullHouse: out.fullHouse ?? 0,
    flush: out.flush ?? 0,
    straight: out.straight ?? 0,
    trips: out.trips ?? 0,
  };
}

export function uthTripsOutcomes(payouts: Record<TripsHand, number>): CoverageOutcome[] {
  return TRIPS_HANDS.filter((hand) => payouts[hand] > 0).map((hand) => ({
    id: hand,
    probability: SEVEN_CARD_COMBOS[hand] / SEVEN_CARD_HANDS,
    payout: payouts[hand],
  }));
}

/** Bank edge per $1 of Trips; `cap` is the most the bank can pay per $1 on a hit (∞ = fully banked). */
export function realizedUthTripsEdge(payouts: Record<TripsHand, number>, cap = Infinity): number {
  return realizedCoverageEdge(uthTripsOutcomes(payouts), cap);
}

export function uthTripsSigma(payouts: Record<TripsHand, number>, cap = Infinity): number {
  return coverageSigma(uthTripsOutcomes(payouts), cap);
}

export function uthTripsTop(payouts: Record<TripsHand, number>): number {
  return Math.max(...TRIPS_HANDS.map((hand) => payouts[hand]));
}
