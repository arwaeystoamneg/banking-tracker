import { describe, expect, it } from "vitest";
import { describeCliff, findTierForAction, isNearCliff, marginalRake, type FeeTier } from "@/lib/fees/cliff";

// Synthetic tiers built to reproduce the two documented Hollywood Park No Bust cliff numbers from
// CLAUDE.md, without hardcoding those numbers into the module itself: option 15 (uneven, effectively
// $1 steps at the relevant boundaries) hits 300% at $500->$501 and 200% at $300->$301; options 18/19
// ($5 steps) both hit 120% at their boundaries.
const option15Tiers: FeeTier[] = [
  { scheduleId: "opt15", basis: "tta", tierMin: 0, tierMax: 300, pdFee: 10 },
  { scheduleId: "opt15", basis: "tta", tierMin: 301, tierMax: 500, pdFee: 12 },
  { scheduleId: "opt15", basis: "tta", tierMin: 501, tierMax: null, pdFee: 15 },
];

const fiveDollarStepTiers: FeeTier[] = [
  { scheduleId: "opt19", basis: "tta", tierMin: 0, tierMax: 1000, pdFee: 20 },
  { scheduleId: "opt19", basis: "tta", tierMin: 1005, tierMax: null, pdFee: 26 },
];

describe("findTierForAction", () => {
  it("finds the tier containing a given TTA", () => {
    const tier = findTierForAction(option15Tiers, 250);
    expect(tier?.pdFee.toString()).toBe("10");
  });

  it("respects an open-ended top tier", () => {
    const tier = findTierForAction(option15Tiers, 10_000);
    expect(tier?.tierMax).toBeNull();
    expect(tier?.pdFee.toString()).toBe("15");
  });

  it("returns null below the first tier's floor", () => {
    const belowFirst: FeeTier[] = [{ scheduleId: "x", basis: "tta", tierMin: 100, tierMax: 200, pdFee: 5 }];
    expect(findTierForAction(belowFirst, 50)).toBeNull();
  });

  it("is boundary-inclusive on both ends", () => {
    expect(findTierForAction(option15Tiers, 300)?.pdFee.toString()).toBe("10");
    expect(findTierForAction(option15Tiers, 301)?.pdFee.toString()).toBe("12");
  });
});

describe("marginalRake — reproduces documented cliff numbers", () => {
  it("hits 200% marginal rake at the $300 -> $301 boundary", () => {
    const rake = marginalRake(option15Tiers, 300);
    expect(rake?.toNumber()).toBeCloseTo(2.0, 5); // 200%
  });

  it("hits 300% marginal rake at the $500 -> $501 boundary", () => {
    const rake = marginalRake(option15Tiers, 500);
    expect(rake?.toNumber()).toBeCloseTo(3.0, 5); // 300%
  });

  it("hits 120% marginal rake on a $5-increment schedule", () => {
    const rake = marginalRake(fiveDollarStepTiers, 1000);
    expect(rake?.toNumber()).toBeCloseTo(1.2, 5); // 120%
  });

  it("returns null once already in the open-ended top tier", () => {
    expect(marginalRake(option15Tiers, 501)).toBeNull();
    expect(marginalRake(option15Tiers, 5000)).toBeNull();
  });

  it("handles TTA below the first tier by measuring the gap to the first tier's floor", () => {
    const rake = marginalRake(option15Tiers, -50); // hypothetical, exercises the below-all-tiers path
    // deltaAction = 0 - (-50) = 50, deltaFee = 10 - 0 = 10
    expect(rake?.toNumber()).toBeCloseTo(10 / 50, 5);
  });
});

describe("isNearCliff", () => {
  it("warns within the $50 threshold below a boundary", () => {
    expect(isNearCliff(460, option15Tiers)).toBe(true); // 40 below 500
    expect(isNearCliff(455, option15Tiers)).toBe(true); // exactly 50 - 5 below... still within
  });

  it("does not warn far from a boundary", () => {
    expect(isNearCliff(350, option15Tiers)).toBe(false); // 150 below 500, and just past 300
  });

  it("does not warn once past the boundary (already in the next tier)", () => {
    expect(isNearCliff(301, option15Tiers)).toBe(false);
  });

  it("never warns from inside the open-ended top tier", () => {
    expect(isNearCliff(10_000, option15Tiers)).toBe(false);
  });

  it("respects a custom threshold", () => {
    expect(isNearCliff(440, option15Tiers, 10)).toBe(false); // 60 below, outside a $10 threshold
    expect(isNearCliff(495, option15Tiers, 10)).toBe(true); // 5 below, inside a $10 threshold
  });
});

describe("describeCliff", () => {
  it("bundles the boundary distance and marginal rake for the UI", () => {
    const info = describeCliff(480, option15Tiers);
    expect(info?.nextTierMin.toNumber()).toBe(501);
    expect(info?.dollarsToCliff.toNumber()).toBe(21);
    expect(info?.marginalRake.toNumber()).toBeCloseTo(3.0, 5);
  });

  it("returns null when there's no upcoming tier", () => {
    expect(describeCliff(10_000, option15Tiers)).toBeNull();
  });
});
