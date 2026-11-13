import { describe, expect, it } from "vitest";
import { casinoSummaries } from "@/lib/casinos";
import type { GameSearchResult } from "@/lib/search";
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

describe("casinoSummaries", () => {
  it("collects each room's own sessions and listed games, most-played first", () => {
    const casinos = casinoSummaries(
      [
        session({ session_id: "a", date: "2026-11-01", casino: "Oaks", time_out: "20:00", buy_out: 8500 }),
        session({ session_id: "b", date: "2026-11-02", casino: "artichoke joes", time_out: "23:00", buy_out: 9000 }),
        session({ session_id: "c", date: "2026-11-03", casino: "HPC | Commerce", time_out: "23:00", buy_out: 9000 }),
      ],
      [{ game_id: "g1", casinos: "Commerce|The Oaks", sidebets: [] } as unknown as GameSearchResult],
    );
    expect(casinos.map((c) => [c.room, c.sessions.length, c.games.length])).toEqual([
      ["Artichoke Joe's", 1, 0],
      ["Oaks", 1, 1],
      ["Commerce", 0, 1],
    ]);
  });
});
