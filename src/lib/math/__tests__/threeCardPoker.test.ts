import { describe, expect, it } from "vitest";
import {
  CA_FACE_UP_ANTE,
  PAIR_PLUS_BASE_EDGE,
  PAIR_PLUS_COMBOS,
  PAIR_PLUS_COMBOS_NO_MINI,
  PAIR_PLUS_PAYOUTS_CA,
  SIX_CARD_BASE_EDGE,
  SIX_CARD_COMBOS,
  SIX_CARD_HANDS,
  SIX_CARD_PAYOUTS_TCP6B4,
  THREE_CARD_HANDS,
  matchThreeCardSidebet,
  pairPlusCombosForPayouts,
  pairPlusPayoutsFromRows,
  realizedPairPlusEdge,
  realizedSixCardEdge,
  sixCardPayoutsFromRows,
} from "@/lib/math/threeCardPoker";

describe("3-card combinatorics", () => {
  it("C(52,3) is 22,100 and the ranked hands plus junk fill it", () => {
    const ranked = Object.values(PAIR_PLUS_COMBOS_NO_MINI).reduce((sum, n) => sum + n, 0);
    expect(THREE_CARD_HANDS).toBe(22100);
    expect(ranked + 16440).toBe(THREE_CARD_HANDS);
    expect(PAIR_PLUS_COMBOS.miniRoyal + PAIR_PLUS_COMBOS.straightFlush).toBe(48);
  });
});

describe("Pair Plus CA paytable", () => {
  it("Mini Royal 200 / flush 3:1 is ~4.38% house edge", () => {
    // Exact: 1 − Σ (combos/22100)·(payout+1) over paying hands.
    expect(PAIR_PLUS_BASE_EDGE).toBeCloseTo(0.043801, 4);
  });

  it("flush 4:1 without Mini Royal is ~2.32% (Wizard pay table 1)", () => {
    const payouts = { miniRoyal: 0, straightFlush: 40, trips: 30, straight: 6, flush: 4, pair: 1 };
    expect(realizedPairPlusEdge(payouts)).toBeCloseTo(0.0232, 3);
  });

  it("underbanking raises the bank's edge", () => {
    const full = realizedPairPlusEdge(PAIR_PLUS_PAYOUTS_CA, Infinity);
    const tight = realizedPairPlusEdge(PAIR_PLUS_PAYOUTS_CA, 10);
    expect(tight).toBeGreaterThan(full);
  });

  it("parses felt rows and folds Mini Royal into SF when absent", () => {
    const parsed = pairPlusPayoutsFromRows([
      { outcome: "Straight flush", payout: "40:1" },
      { outcome: "Three of a kind", payout: "30:1" },
      { outcome: "Straight", payout: "6:1" },
      { outcome: "Flush", payout: "3:1" },
      { outcome: "Pair", payout: "1:1" },
    ]);
    expect(parsed?.straightFlush).toBe(40);
    expect(pairPlusCombosForPayouts(parsed!).straightFlush).toBe(48);
  });
});

describe("6 Card Bonus TCP-6B4", () => {
  it("combination counts fill C(52,6)", () => {
    const paying = Object.values(SIX_CARD_COMBOS).reduce((sum, n) => sum + n, 0);
    expect(paying + 18876456).toBe(SIX_CARD_HANDS);
  });

  it("Wizard 1-A / TCP-6B4 is 8.56% house edge", () => {
    expect(SIX_CARD_BASE_EDGE).toBeCloseTo(0.085614, 4);
  });

  it("parses felt rows onto the 5-card categories", () => {
    const parsed = sixCardPayoutsFromRows([
      { outcome: "Royal flush", payout: "1000:1" },
      { outcome: "Straight flush", payout: "200:1" },
      { outcome: "Four of a kind", payout: "100:1" },
    ]);
    expect(parsed?.royal).toBe(1000);
    expect(parsed?.quads).toBe(100);
  });
});

describe("CA Face-Up Ante", () => {
  it("is 4.30% of Ante with a 49.5% raise rate (Wizard)", () => {
    expect(CA_FACE_UP_ANTE.edge).toBeCloseTo(0.042964, 5);
    expect(CA_FACE_UP_ANTE.raiseRate).toBeCloseTo(0.49516, 5);
    expect(CA_FACE_UP_ANTE.exposureMult).toBe(2);
  });
});

describe("matchThreeCardSidebet", () => {
  it("maps filed names onto the three wagers", () => {
    expect(matchThreeCardSidebet("Pair Plus")).toBe("pairPlus");
    expect(matchThreeCardSidebet("6 Card Bonus")).toBe("sixCard");
    expect(matchThreeCardSidebet("Ante Bonus")).toBe("anteBonus");
    expect(matchThreeCardSidebet("Bonus Bet")).toBe("pairPlus");
  });
});
