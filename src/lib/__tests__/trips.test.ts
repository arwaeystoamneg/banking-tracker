import { describe, expect, it } from "vitest";
import { groupSessionsIntoTrips } from "@/lib/trips";
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
    low_stack: null,
    high_stack: null,
    logged_by: "Ray",
    logged_at: `${overrides.date}T20:00:00.000Z`,
    _row_version: 1,
    ...overrides,
  };
}

describe("groupSessionsIntoTrips", () => {
  it("groups only by the trip name, never by dates, and leaves untripped sessions out", () => {
    const trips = groupSessionsIntoTrips([
      session({ session_id: "a", date: "2026-08-01", trip: "LA" }),
      session({ session_id: "b", date: "2026-08-20", trip: "la " }),
      session({ session_id: "c", date: "2026-08-02" }),
      session({ session_id: "d", date: "2026-09-01", trip: "Vegas" }),
    ]);
    expect(trips.map((t) => [t.name, t.sessionCount])).toEqual([
      ["Vegas", 1],
      ["la", 2],
    ]);
    expect(trips[1].startDate).toBe("2026-08-01");
    expect(trips[1].endDate).toBe("2026-08-20");
    expect(trips[1].sessions.map((s) => s.session_id)).toEqual(["b", "a"]);
  });

  it("sums net cash over completed sessions and counts open ones", () => {
    const trips = groupSessionsIntoTrips([
      session({ session_id: "a", date: "2026-08-01", trip: "T", buy_in: 8000, buy_out: 8500, time_out: "23:00" }),
      session({ session_id: "b", date: "2026-08-02", trip: "T", buy_in: 8000, buy_out: 7800, time_out: "23:00" }),
      session({ session_id: "c", date: "2026-08-02", trip: "T", buy_out: null }),
    ]);
    expect(trips.length).toBe(1);
    expect(trips[0].netCash.toNumber()).toBe(300); // +500 -200
    expect(trips[0].completedCount).toBe(2);
    expect(trips[0].openCount).toBe(1);
  });

  it("collects distinct canonical casinos across the trip", () => {
    const trips = groupSessionsIntoTrips([
      session({ session_id: "a", date: "2026-08-01", casino: "The Bicycle", trip: "T" }),
      session({ session_id: "b", date: "2026-08-01", casino: "bicycle", trip: "T" }),
      session({ session_id: "c", date: "2026-08-02", casino: "Commerce", trip: "T" }),
    ]);
    expect(trips[0].casinos).toEqual(["Bicycle", "Commerce"]);
  });

  it("orders sessions by when play started, not when they were entered", () => {
    const [trip] = groupSessionsIntoTrips([
      session({ session_id: "late", date: "2026-08-01", time_in: "21:00", trip: "T", logged_at: "2026-08-01T01:00:00.000Z" }),
      session({ session_id: "early", date: "2026-08-01", time_in: "13:00", trip: "T", logged_at: "2026-08-09T01:00:00.000Z" }),
      session({ session_id: "next", date: "2026-08-02", time_in: "02:00", trip: "T", logged_at: "2026-08-01T00:00:00.000Z" }),
    ]);
    expect(trip.sessions.map((s) => s.session_id)).toEqual(["next", "late", "early"]);
  });

  it("returns empty for no sessions", () => {
    expect(groupSessionsIntoTrips([])).toEqual([]);
  });
});
