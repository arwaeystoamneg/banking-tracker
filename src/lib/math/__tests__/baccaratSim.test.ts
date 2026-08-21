import { describe, expect, it } from "vitest";
import { baccaratExpectedValue, BACCARAT_CONSTANTS } from "@/lib/math/baccarat";
import {
  baccaratBankingMoments,
  classifyBaccaratHand,
  settleBaccaratHand,
  simulateBaccaratSessions,
  simulateOutcomeFrequencies,
} from "@/lib/math/baccaratSim";

describe("classifyBaccaratHand", () => {
  const card = (rank: number, suit = 0) => rank + suit * 13; // rank 0=A, 6=7, 7=8

  it("flags Dragon 7 as banker 3-card 7 beating player", () => {
    // Player 2+2=4, Banker 0+0 then 7.
    const hand = classifyBaccaratHand([card(1), card(1)], [card(9), card(9), card(6)]);
    expect(hand.outcome).toBe("dragon7");
  });

  it("flags Panda 8 as player 3-card 8 beating banker", () => {
    const hand = classifyBaccaratHand([card(9), card(9), card(7)], [card(1), card(2)]);
    expect(hand.outcome).toBe("panda8");
  });

  it("a 3-card banker 7 vs player 7 is a tie, not Dragon", () => {
    const hand = classifyBaccaratHand([card(6), card(9)], [card(9), card(9), card(6)]);
    expect(hand.outcome).toBe("tie");
  });
});

describe("deal frequencies vs CLAUDE.md", () => {
  it("a 300k-hand deal sits on the published 8-deck mix", () => {
    const f = simulateOutcomeFrequencies(300_000, 999);
    const pPlayer = f.player + f.panda8;
    const pBanker = f.banker + f.dragon7;
    expect(pPlayer).toBeCloseTo(BACCARAT_CONSTANTS.pPlayerWin, 2);
    expect(pBanker).toBeCloseTo(BACCARAT_CONSTANTS.pBankerWin, 2);
    expect(f.tie).toBeCloseTo(BACCARAT_CONSTANTS.pTie, 2);
    expect(f.dragon7).toBeCloseTo(BACCARAT_CONSTANTS.pBanker3Card7, 2);
  });
});

describe("settlement follows the hand, not a leftover-bank story", () => {
  const bets = { player: 2500, banker: 2500, tie: 300, dragon: 500, pandaKoi: 500 };

  it("Dragon 7 pays from the $17k tray; collecting Player/Tie/Koi does not fund the 40:1", () => {
    const s = settleBaccaratHand("dragon7", 17_000, bets);
    expect(s.perBet.player).toBe(2500);
    expect(s.perBet.banker).toBe(0);
    expect(s.perBet.pandaKoi).toBe(500);
    expect(s.perBet.tie).toBe(300);
    // $500 × 40 = $20k owed; $17k pays ×34. Collects happen after.
    expect(s.paidMultiple.dragon).toBeCloseTo(34, 6);
    expect(s.perBet.dragon).toBe(-17_000);
  });

  it("Panda 8 pays Player from the tray first, then Koi from what's left — no Banker collect in between", () => {
    const s = settleBaccaratHand("panda8", 17_000, bets);
    expect(s.perBet.player).toBe(-2500);
    expect(s.perBet.banker).toBe(2500);
    // $17k − $2.5k Player = $14.5k vs $12.5k Koi, still full 25:1.
    expect(s.paidMultiple.pandaKoi).toBe(25);
  });

  it("Tie pushes both main lines and pays Tie from the buy-in", () => {
    const s = settleBaccaratHand("tie", 17_000, bets);
    expect(s.perBet.player).toBe(0);
    expect(s.perBet.banker).toBe(0);
    expect(s.paidMultiple.tie).toBe(8);
  });

  it("17k / 5k Player / 300 / 500 / 500: Dragon is short; Koi is short after paying Player", () => {
    const table = { player: 5000, banker: 0, tie: 300, dragon: 500, pandaKoi: 500 };
    const dragon = settleBaccaratHand("dragon7", 17_000, table);
    expect(dragon.paidMultiple.dragon).toBeCloseTo(34, 6);
    expect(dragon.perBet.player).toBe(5000);
    const panda = settleBaccaratHand("panda8", 17_000, table);
    // $17k − $5k Player = $12k vs $12.5k Koi → ×24 of 25:1.
    expect(panda.paidMultiple.player).toBe(1);
    expect(panda.paidMultiple.pandaKoi).toBeCloseTo(24, 6);
  });

  it("a short bank on Dragon still collects Player after; it does not use that collect to pay", () => {
    const s = settleBaccaratHand("dragon7", 5_000, { ...bets, dragon: 500 });
    expect(s.perBet.player).toBe(2500);
    expect(s.perBet.banker).toBe(0);
    expect(s.paidMultiple.dragon).toBeCloseTo(10, 6);
  });
});

describe("fully-banked moments match the closed form", () => {
  it("Player/Banker EV agrees with baccaratExpectedValue when the bank is huge", () => {
    const bets = { player: 500, banker: 500, tie: 0, dragon: 0, pandaKoi: 0 };
    const m = baccaratBankingMoments(1_000_000, bets);
    const closed = baccaratExpectedValue(500, 500).toNumber();
    expect(m.ev).toBeCloseTo(closed, 1);
  });
});

describe("simulateBaccaratSessions", () => {
  it("returns a SimResult-shaped object including rounds", () => {
    const r = simulateBaccaratSessions({
      bank: 8000,
      collection: 5,
      bets: { player: 500, banker: 500, tie: 0, dragon: 0, pandaKoi: 0 },
      sessions: 2,
      roundsPerSession: 3,
      seed: 1,
    });
    expect(r.rounds).toBe(6);
    expect(r.sdPerRound).toBeGreaterThanOrEqual(0);
  });
});
