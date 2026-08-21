import { describe, expect, it } from "vitest";
import { BACCARAT_CONSTANTS } from "@/lib/math/baccarat";
import {
  BACCARAT_BET_BASE_EDGE,
  baccaratBetCap,
  baccaratBetEdgeForCoverage,
  baccaratBetModel,
  baccaratBetPayoutFromRows,
  baccaratBetSigma,
  matchBaccaratSidebet,
  realizedBaccaratBetEdge,
} from "@/lib/math/baccaratBets";

describe("fully-banked edges match published figures", () => {
  it("Player line is +1.235% (CLAUDE.md)", () => {
    expect(BACCARAT_BET_BASE_EDGE.player).toBeCloseTo(0.01235, 5);
  });

  it("Banker line is +1.011% (CLAUDE.md, Dragon 7 pushes)", () => {
    expect(BACCARAT_BET_BASE_EDGE.banker).toBeCloseTo(0.01011, 5);
  });

  it("Tie 8:1 is ~14.36% from P(tie)", () => {
    const p = BACCARAT_CONSTANTS.pTie;
    expect(BACCARAT_BET_BASE_EDGE.tie).toBeCloseTo(1 - p * 9, 6);
    expect(BACCARAT_BET_BASE_EDGE.tie).toBeCloseTo(0.143596, 5);
  });

  it("Dragon 7 40:1 uses pBanker3Card7 (~7.91%)", () => {
    const p = BACCARAT_CONSTANTS.pBanker3Card7;
    expect(BACCARAT_BET_BASE_EDGE.dragon).toBeCloseTo(1 - p * 41, 6);
  });

  it("Panda / Koi 25:1 is the published ~10.19% (Wizard 8-deck)", () => {
    expect(BACCARAT_BET_BASE_EDGE.pandaKoi).toBeCloseTo(0.101882, 5);
  });
});

describe("realized edge vs coverage", () => {
  it("rises monotonically as the payout cap tightens for each tail bet", () => {
    for (const kind of ["tie", "dragon", "pandaKoi"] as const) {
      const model = baccaratBetModel(kind);
      const full = realizedBaccaratBetEdge(model, model.payout);
      const mid = realizedBaccaratBetEdge(model, model.payout / 2);
      const tight = realizedBaccaratBetEdge(model, 1);
      expect(full).toBeCloseTo(BACCARAT_BET_BASE_EDGE[kind], 6);
      expect(mid).toBeGreaterThan(full);
      expect(tight).toBeGreaterThan(mid);
    }
  });

  it("Player/Banker only move when cap drops below 1:1 (even money)", () => {
    const player = baccaratBetModel("player");
    expect(realizedBaccaratBetEdge(player, 8)).toBeCloseTo(BACCARAT_BET_BASE_EDGE.player, 9);
    expect(realizedBaccaratBetEdge(player, 1)).toBeCloseTo(BACCARAT_BET_BASE_EDGE.player, 9);
    expect(realizedBaccaratBetEdge(player, 0.5)).toBeGreaterThan(BACCARAT_BET_BASE_EDGE.player);
  });

  it("sigma shrinks as payouts are capped", () => {
    const dragon = baccaratBetModel("dragon");
    const full = baccaratBetSigma(dragon);
    const capped = baccaratBetSigma(dragon, 5);
    expect(full).toBeGreaterThan(1);
    expect(capped).toBeLessThan(full);
    expect(capped).toBeGreaterThan(0);
  });

  it("baccaratBetEdgeForCoverage maps bank/action to a cap", () => {
    expect(baccaratBetEdgeForCoverage("dragon", 2000, 50)).toBeCloseTo(
      realizedBaccaratBetEdge(baccaratBetModel("dragon"), 40),
      9,
    );
    expect(baccaratBetEdgeForCoverage("tie", 2000, 0)).toBe(BACCARAT_BET_BASE_EDGE.tie);
    expect(baccaratBetEdgeForCoverage("pandaKoi", 0, 5)).toBeCloseTo(
      realizedBaccaratBetEdge(baccaratBetModel("pandaKoi"), 0),
      9,
    );
    expect(baccaratBetEdgeForCoverage("pandaKoi", 0, 5)).toBeGreaterThan(0.96);
  });

  it("baccaratBetCap is bank/size and ∞ when size is 0", () => {
    expect(baccaratBetCap(8000, 200)).toBe(40);
    expect(baccaratBetCap(100, 0)).toBe(Infinity);
    expect(baccaratBetCap(-50, 10)).toBe(0);
  });
});

describe("paytable / name matching", () => {
  it("matches Dragon and Panda/Koi side-bet names, not Main", () => {
    expect(matchBaccaratSidebet("Dragon")).toBe("dragon");
    expect(matchBaccaratSidebet("Koi")).toBe("pandaKoi");
    expect(matchBaccaratSidebet("Panda 8")).toBe("pandaKoi");
    expect(matchBaccaratSidebet("Tie")).toBe("tie");
    expect(matchBaccaratSidebet("Main (Banker/Player/Tie)")).toBeNull();
    expect(matchBaccaratSidebet("Dragon 7 / Panda 8 (EZ)")).toBeNull();
  });

  it("reads the felt payout and falls back when the row is TBD", () => {
    expect(
      baccaratBetPayoutFromRows("dragon", [{ outcome: "Dragon 7 (Banker 3-card 7)", payout: "40:1" }]),
    ).toBe(40);
    expect(
      baccaratBetPayoutFromRows("pandaKoi", [{ outcome: "Panda 8 (Player 3-card 8)", payout: "25:1" }]),
    ).toBe(25);
    expect(baccaratBetPayoutFromRows("tie", [{ outcome: "Tie", payout: "8:1" }])).toBe(8);
    expect(
      baccaratBetPayoutFromRows("dragon", [{ outcome: "PLACEHOLDER", payout: "TBD" }]),
    ).toBeNull();
  });
});

describe("payout override tracks the felt", () => {
  it("a shorter Dragon line raises the fully-banked edge", () => {
    const standard = realizedBaccaratBetEdge(baccaratBetModel("dragon", 40), Infinity);
    const short = realizedBaccaratBetEdge(baccaratBetModel("dragon", 30), Infinity);
    expect(short).toBeGreaterThan(standard);
  });
});
