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
    logged_by: "Ray",
    logged_at: `${overrides.date}T20:00:00.000Z`,
    _row_version: 1,
    ...overrides,
  };
}

describe("groupSessionsIntoTrips", () => {
  it("keeps consecutive days in one trip and splits on a multi-day gap", () => {
    const trips = groupSessionsIntoTrips([
      session({ session_id: "a", date: "2026-08-01" }),
      session({ session_id: "b", date: "2026-08-02" }),
      session({ session_id: "c", date: "2026-08-10" }),
    ]);
    expect(trips.length).toBe(2);
    // Most-recent trip first.
    expect(trips[0].startDate).toBe("2026-08-10");
    expect(trips[1].sessionCount).toBe(2);
    expect(trips[1].startDate).toBe("2026-08-01");
    expect(trips[1].endDate).toBe("2026-08-02");
  });

  it("groups multiple same-day sessions together", () => {
    const trips = groupSessionsIntoTrips([
      session({ session_id: "a", date: "2026-08-01" }),
      session({ session_id: "b", date: "2026-08-01" }),
    ]);
    expect(trips.length).toBe(1);
    expect(trips[0].sessionCount).toBe(2);
  });

  it("sums net cash over completed sessions and counts open ones", () => {
    const trips = groupSessionsIntoTrips([
      session({ session_id: "a", date: "2026-08-01", buy_in: 8000, buy_out: 8500, time_out: "23:00" }),
      session({ session_id: "b", date: "2026-08-02", buy_in: 8000, buy_out: 7800, time_out: "23:00" }),
      session({ session_id: "c", date: "2026-08-02", buy_out: null }),
    ]);
    expect(trips.length).toBe(1);
    expect(trips[0].netCash.toNumber()).toBe(300); // +500 -200
    expect(trips[0].completedCount).toBe(2);
    expect(trips[0].openCount).toBe(1);
  });

  it("collects distinct canonical casinos across the trip", () => {
    const trips = groupSessionsIntoTrips([
      session({ session_id: "a", date: "2026-08-01", casino: "The Bicycle" }),
      session({ session_id: "b", date: "2026-08-01", casino: "bicycle" }),
      session({ session_id: "c", date: "2026-08-02", casino: "Commerce" }),
    ]);
    expect(trips[0].casinos).toEqual(["Bicycle", "Commerce"]);
  });

  it("returns empty for no sessions", () => {
    expect(groupSessionsIntoTrips([])).toEqual([]);
  });
});
