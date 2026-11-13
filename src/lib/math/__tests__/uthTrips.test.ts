import { describe, expect, it } from "vitest";
import { realizedUthTripsEdge, SEVEN_CARD_COMBOS, SEVEN_CARD_HANDS, uthTripsPayoutsFromRows } from "@/lib/math/uthTrips";

describe("UTH Trips", () => {
  it("uses the exact seven-card counts (the rest are two pair, pair, and high card)", () => {
    const listed = Object.values(SEVEN_CARD_COMBOS).reduce((a, b) => a + b, 0);
    expect(listed + 31_433_400 + 58_627_800 + 23_294_460).toBe(SEVEN_CARD_HANDS);
  });

  it("matches the published 1.90% house edge on the standard 50-40-30-8-6-5-3 table", () => {
    const payouts = { royal: 50, straightFlush: 40, quads: 30, fullHouse: 8, flush: 6, straight: 5, trips: 3 };
    expect(realizedUthTripsEdge(payouts)).toBeCloseTo(0.01904, 4);
  });

  it("reads the felt, pays an unlisted royal as a straight flush, and rises when the bank can't pay in full", () => {
    const payouts = uthTripsPayoutsFromRows([
      { outcome: "Straight Flush", payout: "40:1" },
      { outcome: "Four of a Kind", payout: "30:1" },
      { outcome: "Full House", payout: "9:1" },
      { outcome: "Flush", payout: "7:1" },
      { outcome: "Straight", payout: "4:1" },
      { outcome: "Three of a Kind", payout: "3:1" },
    ])!;
    expect(payouts.royal).toBe(40);
    const full = realizedUthTripsEdge(payouts);
    expect(realizedUthTripsEdge(payouts, 10)).toBeGreaterThan(full);
  });
});
