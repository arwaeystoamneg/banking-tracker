import { describe, expect, it } from "vitest";
import { computeBankingEV, type EVInput } from "@/lib/math/evCalc";

const baseInput = (over: Partial<EVInput> = {}): EVInput => ({
  bank: 8000,
  collection: 5,
  base: { actionOffered: 2000, edge: 0.011, exposureMult: 1, sigma: 1 },
  sides: [{ actionOffered: 200, edge: 0.05, exposureMult: 30, sigma: 5 }],
  spots: 6,
  rho: 0.5,
  ...over,
});

describe("computeBankingEV — underbanking / settlement order", () => {
  it("books full action when the bank is ample", () => {
    const r = computeBankingEV(baseInput());
    expect(r.base.booked.toNumber()).toBe(2000);
    expect(r.sides[0].booked.toNumber()).toBe(200);
    expect(r.fullyBanked).toBe(true);
    expect(r.coveragePct.toNumber()).toBe(1);
  });

  it("caps base action at bank/exposure when underbanked, and EV nets the full collection", () => {
    const r = computeBankingEV(
      baseInput({
        bank: 6000,
        base: { actionOffered: 4000, edge: 0.02, exposureMult: 3, sigma: 1 },
        sides: [],
      }),
    );
    expect(r.base.booked.toNumber()).toBe(2000); // 6000 / 3
    expect(r.fullyBanked).toBe(false);
    expect(r.ev.toNumber()).toBeCloseTo(35); // 0.02*2000 - 5
  });

  it("settles base first — side bets only get the leftover bank", () => {
    const r = computeBankingEV(
      baseInput({
        bank: 3000,
        base: { actionOffered: 3000, edge: 0.011, exposureMult: 1, sigma: 1 },
        sides: [{ actionOffered: 500, edge: 0.08, exposureMult: 30, sigma: 5 }],
      }),
    );
    expect(r.base.booked.toNumber()).toBe(3000);
    expect(r.sides[0].booked.toNumber()).toBe(0);
    expect(r.sides[0].ev.toNumber()).toBe(0);
  });

  it("gives each side layer the remaining bank in order", () => {
    // Bank 8000, base 1x offered 6000 -> uses 6000, leaves 2000.
    // Side A 30x books min(500, 2000/30)=66.67, uses 2000; Side B then gets nothing.
    const r = computeBankingEV(
      baseInput({
        bank: 8000,
        base: { actionOffered: 6000, edge: 0.011, exposureMult: 1, sigma: 1 },
        sides: [
          { actionOffered: 500, edge: 0.08, exposureMult: 30, sigma: 5 },
          { actionOffered: 500, edge: 0.1, exposureMult: 30, sigma: 6 },
        ],
      }),
    );
    expect(r.base.booked.toNumber()).toBe(6000);
    expect(r.sides[0].booked.toNumber()).toBeCloseTo(2000 / 30);
    expect(r.sides[1].booked.toNumber()).toBe(0);
  });

  it("aggregates EV and variance across all layers", () => {
    const r = computeBankingEV(baseInput());
    const manualEv = r.base.ev.plus(r.sides[0].ev).minus(5);
    expect(r.ev.toNumber()).toBeCloseTo(manualEv.toNumber());
    expect(r.variance.toNumber()).toBeCloseTo(r.base.variance.plus(r.sides[0].variance).toNumber());
    expect(r.sd.toNumber()).toBeCloseTo(r.variance.sqrt().toNumber());
    expect(r.n0.toNumber()).toBeCloseTo(r.sd.dividedBy(r.ev).pow(2).toNumber());
  });

  it("reports ruin ~1 and infinite N0/Kelly when EV is non-positive", () => {
    const r = computeBankingEV(
      baseInput({
        collection: 100,
        base: { actionOffered: 1000, edge: 0.011, exposureMult: 1, sigma: 1 },
        sides: [],
      }),
    );
    expect(r.ev.isNegative()).toBe(true);
    expect(r.riskOfRuin.toNumber()).toBe(1);
    expect(r.n0.isFinite()).toBe(false);
    expect(r.kellyBank.isFinite()).toBe(false);
  });
});
