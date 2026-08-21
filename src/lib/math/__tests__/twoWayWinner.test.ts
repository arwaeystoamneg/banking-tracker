import { describe, expect, it } from "vitest";
import {
  FORTUNE_PAI_GOW_BASE_EDGE,
  FORTUNE_PAI_GOW_PAYOUTS,
  TWO_WAY_WINNER,
  TWO_WAY_WINNER_BONUS_BASE_EDGE,
  TWO_WAY_WINNER_BONUS_PAYOUTS,
  classifyTwoWayBonusHand,
  matchFortuneBonus,
  matchTwoWayWinnerBonus,
  realizedTwoWayWinnerBonusEdge,
  twoWayWinnerBonusLinesFromRows,
  twoWayWinnerBonusPayoutsFromRows,
} from "@/lib/math/twoWayWinner";

describe("Two Way Winner base", () => {
  it("books two equal Antes and uses a 5% skill-leak estimate, not a solved edge", () => {
    expect(TWO_WAY_WINNER.antes).toBe(2);
    expect(TWO_WAY_WINNER.edge).toBe(0.05);
  });
});

describe("Two Way Winner bonus", () => {
  it("is 9.90% to-1 / 29.09% for-1 on the 5000:1 cloth", () => {
    expect(TWO_WAY_WINNER_BONUS_BASE_EDGE).toBeCloseTo(0.098995, 5);
  });

  it("classifies natural 7-card SF before joker 7-card SF, and royal before SF", () => {
    expect(classifyTwoWayBonusHand("Natural 7-card straight flush")).toBe("natural7SF");
    expect(classifyTwoWayBonusHand("Seven-card straight flush")).toBe("sevenCardSF");
    expect(classifyTwoWayBonusHand("7-card straight flush (no joker)")).toBe("natural7SF");
    expect(classifyTwoWayBonusHand("Royal flush + royal match")).toBe("royalMatch");
    expect(classifyTwoWayBonusHand("Royal flush")).toBe("royal");
    expect(classifyTwoWayBonusHand("Straight flush")).toBe("straightFlush");
    expect(classifyTwoWayBonusHand("Five aces")).toBe("fiveAces");
  });

  it("parses felt rows onto the 7-card categories and keeps default lines that are missing", () => {
    const parsed = twoWayWinnerBonusPayoutsFromRows([
      { outcome: "Royal flush", payout: "80:1" },
      { outcome: "Straight flush", payout: "40:1" },
    ]);
    expect(parsed.royal).toBe(80);
    expect(parsed.straightFlush).toBe(40);
    expect(parsed.natural7SF).toBe(TWO_WAY_WINNER_BONUS_PAYOUTS.natural7SF);
  });

  it("still lists paytable rows that do not match a category", () => {
    const lines = twoWayWinnerBonusLinesFromRows([
      { outcome: "Royal flush", payout: "100:1" },
      { outcome: "PLACEHOLDER", payout: "TBD" },
    ]);
    expect(lines).toEqual([{ outcome: "Royal flush", payout: 100 }]);
  });

  it("underbanking raises the bank's bonus edge", () => {
    const full = realizedTwoWayWinnerBonusEdge(TWO_WAY_WINNER_BONUS_PAYOUTS, Infinity);
    const tight = realizedTwoWayWinnerBonusEdge(TWO_WAY_WINNER_BONUS_PAYOUTS, 10);
    expect(tight).toBeGreaterThan(full);
  });

  it("matches the bonus wager by name and does not swallow Fortune", () => {
    expect(matchTwoWayWinnerBonus("Bonus")).toBe(true);
    expect(matchTwoWayWinnerBonus("2WW Bonus Bet")).toBe(true);
    expect(matchTwoWayWinnerBonus("Play")).toBe(false);
    expect(matchTwoWayWinnerBonus("Fortune Bonus")).toBe(false);
    expect(matchFortuneBonus("Fortune Bonus")).toBe(true);
  });
});

describe("Pai Gow Fortune (same 7-card counts)", () => {
  it("Wizard pay table 2 is 7.77% to-1 with Royal Match posted", () => {
    expect(FORTUNE_PAI_GOW_BASE_EDGE).toBeCloseTo(0.077656, 5);
    const parsed = twoWayWinnerBonusPayoutsFromRows(
      [
        { outcome: "7-card straight flush (no joker)", payout: "8000:1" },
        { outcome: "Royal flush + royal match", payout: "2000:1" },
        { outcome: "7-card straight flush (with joker)", payout: "1000:1" },
      ],
      FORTUNE_PAI_GOW_PAYOUTS,
    );
    expect(parsed.natural7SF).toBe(8000);
    expect(parsed.royalMatch).toBe(2000);
    expect(parsed.sevenCardSF).toBe(1000);
    expect(realizedTwoWayWinnerBonusEdge(parsed)).toBeCloseTo(FORTUNE_PAI_GOW_BASE_EDGE, 5);
  });
});
