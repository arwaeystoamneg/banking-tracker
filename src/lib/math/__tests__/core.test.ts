import { describe, expect, it } from "vitest";
import {
  actionBooked,
  breakevenAction,
  evPerRound,
  isStatisticallyMeaningful,
  n0RoundsForSignificance,
  riskOfRuin,
  standardDeviation,
  tStatistic,
} from "@/lib/math/core";

describe("actionBooked", () => {
  it("caps action at bank / exposure multiple when offered action exceeds capacity", () => {
    // $8,000 bank, exposure multiple 2.5 (blackjack-like) -> capacity $3,200
    const result = actionBooked(5000, 8000, 2.5);
    expect(result.toNumber()).toBe(3200);
  });

  it("passes through offered action when under capacity", () => {
    const result = actionBooked(1000, 8000, 1);
    expect(result.toNumber()).toBe(1000);
  });
});

describe("evPerRound / breakevenAction", () => {
  it("does not scale the collection fee with coverage", () => {
    const ev = evPerRound(0.01123, 1000, 15);
    expect(ev.toNumber()).toBeCloseTo(1000 * 0.01123 - 15, 5);
  });

  it("computes breakeven action as C / e", () => {
    const a = breakevenAction(15, 0.01123);
    expect(a.toNumber()).toBeCloseTo(15 / 0.01123, 5);
  });
});

describe("standardDeviation", () => {
  it("reduces to sigma*w at n=1 regardless of rho", () => {
    const sd = standardDeviation(100, 1, 1, 0.5);
    expect(sd.toNumber()).toBeCloseTo(100, 5);
  });

  it("increases with higher correlation at n>1", () => {
    const lowRho = standardDeviation(100, 1, 4, 0);
    const highRho = standardDeviation(100, 1, 4, 1);
    expect(highRho.greaterThan(lowRho)).toBe(true);
  });
});

describe("n0RoundsForSignificance / tStatistic", () => {
  it("computes N0 = (SD/EV)^2", () => {
    const n0 = n0RoundsForSignificance(500, 10);
    expect(n0.toNumber()).toBeCloseTo((500 / 10) ** 2, 5);
  });

  it("flags |t| < 2 as not yet meaningful", () => {
    const t = tStatistic(50, 500, 10); // small sample, small result
    expect(isStatisticallyMeaningful(t)).toBe(false);
  });

  it("flags |t| >= 2 as meaningful", () => {
    const t = tStatistic(15_000, 500, 100); // t = 15000 / (500*sqrt(100)) = 3
    expect(isStatisticallyMeaningful(t)).toBe(true);
  });
});

describe("riskOfRuin", () => {
  it("is between 0 and 1 for positive EV", () => {
    const r = riskOfRuin(10, 8000, 1_000_000);
    expect(r.greaterThan(0)).toBe(true);
    expect(r.lessThan(1)).toBe(true);
  });

  it("approaches 1 as EV approaches zero", () => {
    const r = riskOfRuin(0, 8000, 1_000_000);
    expect(r.toNumber()).toBeCloseTo(1, 5);
  });
});
