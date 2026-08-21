import { describe, expect, it } from "vitest";
import { simulateSessions, type SimInput } from "@/lib/math/evSim";

const input = (over: Partial<SimInput> = {}): SimInput => ({
  bank: 8000,
  collection: 5,
  layers: [
    { booked: 2000, edge: 0.011, sigma: 1 },
    { booked: 200, edge: 0.05, sigma: 5 },
  ],
  spots: 6,
  rho: 0.5,
  sessions: 2000,
  roundsPerSession: 50,
  seed: 42,
  ...over,
});

describe("simulateSessions", () => {
  it("is deterministic for a given seed", () => {
    const a = simulateSessions(input());
    const b = simulateSessions(input());
    expect(a.evPerRound).toBe(b.evPerRound);
    expect(a.riskOfRuin).toBe(b.riskOfRuin);
  });

  it("simulated EV/round converges to the analytic edge·booked − collection", () => {
    const r = simulateSessions(input({ sessions: 8000, roundsPerSession: 60 }));
    const analytic = 0.011 * 2000 + 0.05 * 200 - 5; // 22 + 10 - 5 = 27
    expect(r.evPerRound).toBeCloseTo(analytic, 0);
    expect(r.rounds).toBe(8000 * 60);
  });

  it("produces a positive SD and a plausible percentile ordering", () => {
    const r = simulateSessions(input());
    expect(r.sdPerRound).toBeGreaterThan(0);
    expect(r.p5SessionPnl).toBeLessThanOrEqual(r.medianSessionPnl);
    expect(r.medianSessionPnl).toBeLessThanOrEqual(r.p95SessionPnl);
    expect(r.medianMaxDrawdown).toBeGreaterThanOrEqual(0);
  });

  it("ruin rises as the bank shrinks", () => {
    const fat = simulateSessions(input({ bank: 50000 }));
    const thin = simulateSessions(input({ bank: 1500, collection: 20 }));
    expect(thin.riskOfRuin).toBeGreaterThanOrEqual(fat.riskOfRuin);
  });

  it("stays finite for an out-of-range negative correlation (no NaN)", () => {
    const r = simulateSessions(input({ rho: -1 }));
    expect(Number.isFinite(r.evPerRound)).toBe(true);
    expect(Number.isFinite(r.sdPerRound)).toBe(true);
    expect(Number.isFinite(r.riskOfRuin)).toBe(true);
    expect(Number.isFinite(r.medianSessionPnl)).toBe(true);
  });

  it("a negative-EV table loses money on average", () => {
    const r = simulateSessions(input({ collection: 100, layers: [{ booked: 1000, edge: 0.011, sigma: 1 }] }));
    expect(r.evPerRound).toBeLessThan(0);
    expect(r.medianSessionPnl).toBeLessThan(0);
  });
});
