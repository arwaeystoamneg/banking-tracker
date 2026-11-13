import { describe, expect, it } from "vitest";
import { computeResultStats, statsByRoom } from "@/lib/stats/resultStats";
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
    // hourly -187.5: misses of 1375, -2250, 875 over 2h, 4h, 2h → σ² = (945312.5 + 1265625 + 382812.5) / 3.
    expect(stats.sdPerHour).toBeCloseTo(Math.sqrt(2593750 / 3), 6);
    const margin = (1.96 * Math.sqrt(2593750 / 3)) / Math.sqrt(8);
    expect(stats.hourlyRange?.[0]).toBeCloseTo(-187.5 - margin, 6);
  });

  it("pulls a small group's σ toward the team-wide σ instead of trusting three similar results", () => {
    // Oaks on the live sheet: -$161/hr, -$265/hr, -$96/hr → own σ ≈ $92/hr, which claimed a sure loss.
    const oaks = [
      session({ session_id: "a", date: "2026-10-03", time_in: "23:00", time_out: "02:00", buy_in: 10000, buy_out: 9516 }),
      session({ session_id: "b", date: "2026-10-30", time_in: "01:00", time_out: "03:30", buy_in: 15000, buy_out: 14338 }),
      session({ session_id: "c", date: "2026-11-04", time_in: "22:20", time_out: "23:20", buy_in: 10000, buy_out: 9904 }),
    ];
    const own = computeResultStats(oaks);
    expect(own.sdPerHour).toBeLessThan(100);
    const blended = computeResultStats(oaks, 2000);
    const sd = Math.sqrt((3 * own.sdPerHour! ** 2 + 10 * 2000 ** 2) / 13);
    expect(blended.sdPerHour).toBeCloseTo(sd, 6);
    expect(blended.sdIsRough).toBe(true);
    expect(blended.hourlyRange![0]).toBeLessThan(0);
    expect(blended.hourlyRange![1]).toBeGreaterThan(0);
  });

  it("gives no range under three timed sessions", () => {
    const stats = computeResultStats(
      [
        session({ session_id: "a", date: "2026-11-01", time_in: "18:00", time_out: "19:00", buy_in: 10000, buy_out: 0 }),
        session({ session_id: "b", date: "2026-11-02", time_in: "18:00", time_out: "19:00", buy_in: 10000, buy_out: 9000 }),
      ],
      2000,
    );
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
