import { describe, expect, it } from "vitest";
import { baccaratExpectedValue, baccaratVariance } from "@/lib/math/baccarat";
import { d } from "@/lib/decimal";

describe("baccaratExpectedValue", () => {
  it("gives +1.235% edge against pure Player-line action (b=0)", () => {
    const p = d(1000);
    const ev = baccaratExpectedValue(p, 0);
    const edgePct = ev.dividedBy(p);
    expect(edgePct.toDecimalPlaces(5).toNumber()).toBeCloseTo(0.01235, 5);
  });

  it("gives +1.011% edge against pure Banker-line action (p=0)", () => {
    const b = d(1000);
    const ev = baccaratExpectedValue(0, b);
    const edgePct = ev.dividedBy(b);
    expect(edgePct.toDecimalPlaces(5).toNumber()).toBeCloseTo(0.01011, 5);
  });

  it("gives +1.123% of TTA when balanced (p=b)", () => {
    const p = d(500);
    const b = d(500);
    const tta = p.plus(b);
    const ev = baccaratExpectedValue(p, b);
    const edgePct = ev.dividedBy(tta);
    expect(edgePct.toDecimalPlaces(5).toNumber()).toBeCloseTo(0.01123, 5);
  });
});

describe("baccaratVariance", () => {
  it("is driven by imbalance: a balanced table cuts SD ~12.8x at identical action", () => {
    const action = d(1000);

    // Fully imbalanced: all action on one line.
    const imbalancedVar = baccaratVariance(action, 0);
    const imbalancedSd = imbalancedVar.sqrt();

    // Balanced: same total action split evenly.
    const half = action.dividedBy(2);
    const balancedVar = baccaratVariance(half, half);
    const balancedSd = balancedVar.sqrt();

    const ratio = imbalancedSd.dividedBy(balancedSd);
    expect(ratio.toNumber()).toBeCloseTo(12.8, 0);
  });

  it("is never negative for reasonable inputs", () => {
    const variance = baccaratVariance(700, 300);
    expect(variance.isNegative()).toBe(false);
  });
});
