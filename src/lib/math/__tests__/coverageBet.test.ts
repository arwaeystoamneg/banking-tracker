import { describe, expect, it } from "vitest";
import { coverageCap, coverageSigma, realizedCoverageEdge } from "@/lib/math/coverageBet";

const dragon = [{ id: "win", probability: 0.02246, payout: 40 }];

describe("coverageCap", () => {
  it("is bank/size, ∞ when size is 0, and 0 when bank is negative", () => {
    expect(coverageCap(8000, 200)).toBe(40);
    expect(coverageCap(100, 0)).toBe(Infinity);
    expect(coverageCap(-50, 10)).toBe(0);
  });
});

describe("realizedCoverageEdge", () => {
  it("matches 1 − p·(payout+1) when fully banked", () => {
    expect(realizedCoverageEdge(dragon, Infinity)).toBeCloseTo(1 - 0.02246 * 41, 10);
  });

  it("rises as the cap tightens", () => {
    const full = realizedCoverageEdge(dragon, 40);
    const tight = realizedCoverageEdge(dragon, 10);
    expect(tight).toBeGreaterThan(full);
  });
});

describe("coverageSigma", () => {
  it("shrinks when the tail is capped", () => {
    expect(coverageSigma(dragon, 5)).toBeLessThan(coverageSigma(dragon));
  });
});
