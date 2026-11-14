import { describe, expect, it } from "vitest";
import { computeResultStats, sdPrior, statsByRoom, t95 } from "@/lib/stats/resultStats";
import type { Session } from "@/lib/validation/schemas";

function session(overrides: Partial<Session> & { session_id: string; date: string }): Session {
  return {
    casino: "Commerce",
    buy_in: 8000,
    buy_out: null,
    time_in: "18:00",
    time_out: "",
    game_id: "",
    schedule_option: "",
    rounds_banked: null,
    action_offered: null,
    action_booked: null,
    coverage_pct: null,
    bonus_action_booked: null,
    collection_paid: null,
    gross_wl: null,
    net_pnl: null,
    peak_drawdown: null,
    partners: "",
    split_terms: "",
    notes: "",
    owner_id: "",
    player: "",
    player_id: "",
    payroll_paid_at: "",
    payroll_paid_by: "",
    overtime_status: "",
    ray_sponsored: false,
    trip: "",
    logged_by: "Ray",
    logged_at: `${overrides.date}T20:00:00.000Z`,
    _row_version: 1,
    ...overrides,
  };
}

describe("computeResultStats", () => {
  it("gives hourly, win rate, best/worst and the deepest drop in play order", () => {
    const stats = computeResultStats([
      session({ session_id: "a", date: "2026-11-01", time_in: "18:00", time_out: "20:00", buy_in: 10000, buy_out: 11000 }),
      session({ session_id: "b", date: "2026-11-02", time_in: "18:00", time_out: "22:00", buy_in: 10000, buy_out: 7000 }),
      session({ session_id: "c", date: "2026-11-03", time_in: "18:00", time_out: "20:00", buy_in: 10000, buy_out: 10500 }),
      session({ session_id: "open", date: "2026-11-04", buy_out: null }),
    ]);
    expect(stats.net.toNumber()).toBe(-1500);
    expect(stats.minutes).toBe(480);
    expect(stats.hourly?.toNumber()).toBe(-187.5);
    expect([stats.winningCount, stats.completedCount, stats.sessionCount]).toEqual([2, 3, 4]);
    expect(stats.best?.session_id).toBe("a");
    expect(stats.worst?.session_id).toBe("b");
    // +1000 high, then down to -2000.
    expect(stats.maxDrawdown.toNumber()).toBe(3000);
    // hourly -187.5: misses of 1375, -2250, 875 over 2h, 4h, 2h → σ² = (945312.5 + 1265625 + 382812.5) / (3 − 1).
    expect(stats.sdPerHour).toBeCloseTo(Math.sqrt(2593750 / 2), 6);
    const margin = (4.303 * Math.sqrt(2593750 / 2)) / Math.sqrt(8);
    expect(stats.hourlyRange?.[0]).toBeCloseTo(-187.5 - margin, 6);
  });

  // Elsewhere: ten $10k sessions swinging ±$1,000 over an hour, ten $20k sessions swinging ±$5,000.
  const elsewhere = Array.from({ length: 20 }, (_, i) => {
    const big = i >= 10;
    const swing = (big ? 5000 : 1000) * (i % 2 ? 1 : -1);
    const buyIn = big ? 20000 : 10000;
    return session({ session_id: `e${i}`, date: "2026-09-01", time_in: "18:00", time_out: "19:00", buy_in: buyIn, buy_out: buyIn + swing });
  });

  it("pulls a small group's σ toward what sessions at its stakes swing elsewhere", () => {
    // Oaks on the live sheet: -$161/hr, -$265/hr, -$96/hr → own σ ≈ $112/hr, which claimed a sure loss.
    const oaks = [
      session({ session_id: "a", date: "2026-10-03", time_in: "23:00", time_out: "02:00", buy_in: 10000, buy_out: 9516 }),
      session({ session_id: "b", date: "2026-10-30", time_in: "01:00", time_out: "03:30", buy_in: 10000, buy_out: 9338 }),
      session({ session_id: "c", date: "2026-11-04", time_in: "22:20", time_out: "23:20", buy_in: 10000, buy_out: 9904 }),
    ];
    const own = computeResultStats(oaks).sdPerHour!;
    expect(own).toBeLessThan(150);
    const prior = sdPrior([...oaks, ...elsewhere]);
    const blended = computeResultStats(oaks, prior);
    // The $10k tier elsewhere: σ² = 10 · 1000² / 9; Oaks's own sessions don't count toward it.
    const tier = (10 * 1000 ** 2) / 9;
    expect(blended.sdPerHour).toBeCloseTo(Math.sqrt((2 * own ** 2 + 10 * tier) / 12), 6);
    expect(blended.sdIsRough).toBe(true);
    expect(blended.hourlyRange![0]).toBeCloseTo(-191.08 - (t95(12) * blended.sdPerHour!) / Math.sqrt(6.5), 0);
    expect(blended.hourlyRange![1]).toBeGreaterThan(0);
  });

  it("leans big-bankroll sessions on the big-bankroll swing", () => {
    const big = [
      session({ session_id: "x", date: "2026-11-08", time_in: "21:00", time_out: "22:00", buy_in: 19000, buy_out: 19000 }),
      session({ session_id: "y", date: "2026-11-09", time_in: "21:00", time_out: "22:00", buy_in: 19000, buy_out: 19000 }),
    ];
    const prior = sdPrior([...big, ...elsewhere]);
    expect(computeResultStats(big, prior).sdPerHour).toBeCloseTo(Math.sqrt((10 * (10 * 5000 ** 2) / 9) / 11), 6);
  });

  it("matches the t table", () => {
    expect(t95(2)).toBeCloseTo(4.303, 3);
    expect(t95(5)).toBeCloseTo(2.571, 2);
    expect(t95(12)).toBeCloseTo(2.179, 2);
    expect(t95(30)).toBeCloseTo(2.042, 2);
  });

  it("gives no range under three timed sessions", () => {
    const pair = [
      session({ session_id: "a", date: "2026-11-01", time_in: "18:00", time_out: "19:00", buy_in: 10000, buy_out: 0 }),
      session({ session_id: "b", date: "2026-11-02", time_in: "18:00", time_out: "19:00", buy_in: 10000, buy_out: 9000 }),
    ];
    const stats = computeResultStats(pair, sdPrior([...pair, ...elsewhere]));
    expect(stats.sdPerHour).not.toBeNull();
    expect(stats.hourlyRange).toBeNull();
  });

  it("leaves untimed sessions out of hourly but keeps them in net", () => {
    const stats = computeResultStats([
      session({ session_id: "a", date: "2026-11-01", time_in: "18:00", time_out: "20:00", buy_in: 0, buy_out: 400 }),
      session({ session_id: "b", date: "2026-11-02", time_in: "", time_out: "20:00", buy_in: 0, buy_out: 1000, casino: "Oaks" }),
    ]);
    expect(stats.net.toNumber()).toBe(1400);
    expect(stats.hourly?.toNumber()).toBe(200);
  });
});

describe("statsByRoom", () => {
  it("splits by canonical room and groups multi-room nights", () => {
    const rooms = statsByRoom([
      session({ session_id: "a", date: "2026-11-01", time_out: "22:00", buy_out: 9000, casino: "artichoke joes" }),
      session({ session_id: "b", date: "2026-11-02", time_out: "19:00", buy_out: 9000, casino: "Oaks" }),
      session({ session_id: "c", date: "2026-11-03", time_out: "19:00", buy_out: 9000, casino: "HPC | Commerce" }),
    ]);
    expect(rooms.map((r) => r.room)).toEqual(["Artichoke Joe's", "Oaks", "Several rooms"]);
  });
});
