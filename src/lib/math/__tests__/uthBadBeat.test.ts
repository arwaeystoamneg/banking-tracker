import { describe, expect, it } from "vitest";
import {
  BAD_BEAT_BASE_EDGE,
  BAD_BEAT_PROBABILITIES,
  badBeatEdgeForCoverage,
  badBeatSigma,
  evaluate7,
  realizedBadBeatEdge,
  simulateBadBeatProbabilities,
} from "@/lib/math/uthBadBeat";

// Card index 0..51: rank = (i % 13) + 2 (2..14), suit = floor(i / 13).
const card = (rank: number, suit: number) => (rank - 2) + suit * 13;

describe("evaluate7 hand ranking", () => {
  const royal = [card(14, 0), card(13, 0), card(12, 0), card(11, 0), card(10, 0), card(2, 1), card(3, 2)];
  const quads = [card(9, 0), card(9, 1), card(9, 2), card(9, 3), card(4, 0), card(2, 1), card(3, 2)];
  const fullHouse = [card(9, 0), card(9, 1), card(9, 2), card(4, 3), card(4, 0), card(2, 1), card(3, 2)];
  const wheel = [card(14, 0), card(2, 1), card(3, 2), card(4, 3), card(5, 0), card(9, 1), card(11, 2)];

  it("assigns the right categories", () => {
    expect(evaluate7(royal).category).toBe(8);
    expect(evaluate7(quads).category).toBe(7);
    expect(evaluate7(fullHouse).category).toBe(6);
    expect(evaluate7(wheel).category).toBe(4); // A-2-3-4-5 straight
  });

  it("orders categories correctly", () => {
    expect(evaluate7(royal).rank).toBeGreaterThan(evaluate7(quads).rank);
    expect(evaluate7(quads).rank).toBeGreaterThan(evaluate7(fullHouse).rank);
  });
});

describe("bad beat Monte Carlo", () => {
  it("reproduces the published ~14.8% fully-banked house edge", () => {
    const r = simulateBadBeatProbabilities(300_000, 999);
    // Common lines dominate and are stable at this N; tolerance covers MC noise.
    expect(r.baseEdge).toBeGreaterThan(0.12);
    expect(r.baseEdge).toBeLessThan(0.18);
  });

  it("the stored constants give a base edge near 14.7%", () => {
    expect(BAD_BEAT_BASE_EDGE).toBeGreaterThan(0.14);
    expect(BAD_BEAT_BASE_EDGE).toBeLessThan(0.155);
  });
});

describe("realized edge vs coverage", () => {
  it("rises monotonically as the payout cap tightens (more underbanking)", () => {
    const full = realizedBadBeatEdge(BAD_BEAT_PROBABILITIES, 7500);
    const mid = realizedBadBeatEdge(BAD_BEAT_PROBABILITIES, 500);
    const tight = realizedBadBeatEdge(BAD_BEAT_PROBABILITIES, 100);
    expect(full).toBeCloseTo(BAD_BEAT_BASE_EDGE, 6);
    expect(mid).toBeGreaterThan(full);
    expect(tight).toBeGreaterThan(mid);
    // The user's 16–24% band sits between roughly cap 2000 and cap 100.
    expect(realizedBadBeatEdge(BAD_BEAT_PROBABILITIES, 2000)).toBeGreaterThan(0.16);
    expect(tight).toBeLessThan(0.26);
  });

  it("badBeatSigma is large (7500:1 tail) and shrinks as payouts are capped", () => {
    const full = badBeatSigma(BAD_BEAT_PROBABILITIES);
    const capped = badBeatSigma(BAD_BEAT_PROBABILITIES, 100);
    expect(full).toBeGreaterThan(1); // far above an even-money bet's σ≈1
    expect(capped).toBeLessThan(full);
    expect(capped).toBeGreaterThan(0);
  });

  it("badBeatEdgeForCoverage maps bank/action to a cap", () => {
    // $2,000 available, $2 action ⇒ cap 1000×.
    expect(badBeatEdgeForCoverage(2000, 2)).toBeCloseTo(realizedBadBeatEdge(BAD_BEAT_PROBABILITIES, 1000), 9);
    // No action ⇒ base edge. No bank ⇒ every win pays 0 (stake pushes), so edge = P(lose) ≈ 0.96.
    expect(badBeatEdgeForCoverage(2000, 0)).toBe(BAD_BEAT_BASE_EDGE);
    expect(badBeatEdgeForCoverage(0, 5)).toBeCloseTo(realizedBadBeatEdge(BAD_BEAT_PROBABILITIES, 0), 9);
    expect(badBeatEdgeForCoverage(0, 5)).toBeGreaterThan(0.95);
  });
});
