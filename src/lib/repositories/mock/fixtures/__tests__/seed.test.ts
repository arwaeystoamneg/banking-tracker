import { describe, expect, it } from "vitest";
import seed from "@/lib/repositories/mock/fixtures/seed.json";
import {
  feeScheduleSchema,
  gameSchema,
  paytableSchema,
  roundSchema,
  sessionSchema,
  sidebetSchema,
} from "@/lib/validation/schemas";
import { canonicalCasino } from "@/lib/names";

describe("seed fixture", () => {
  it("conforms to the tab schemas", () => {
    expect(() => {
      seed.games.forEach((g) => gameSchema.parse(g));
      seed.sidebets.forEach((s) => sidebetSchema.parse(s));
      seed.paytables.forEach((p) => paytableSchema.parse(p));
      seed.feeSchedules.forEach((f) => feeScheduleSchema.parse(f));
      seed.sessions.forEach((s) => sessionSchema.parse(s));
      seed.rounds.forEach((r) => roundSchema.parse(r));
    }).not.toThrow();
  });

  it("has referentially intact cross-tab ids", () => {
    const gameIds = new Set(seed.games.map((g) => g.game_id));
    const sidebetIds = new Set(seed.sidebets.map((s) => s.sidebet_id));
    const sessionIds = new Set(seed.sessions.map((s) => s.session_id));
    seed.sidebets.forEach((s) => expect(gameIds.has(s.game_id)).toBe(true));
    seed.paytables.forEach((p) => expect(sidebetIds.has(p.sidebet_id)).toBe(true));
    seed.feeSchedules.forEach((f) => expect(gameIds.has(f.game_id)).toBe(true));
    seed.sessions.forEach((s) => expect(s.game_id === "" || gameIds.has(s.game_id)).toBe(true));
    seed.rounds.forEach((r) => expect(sessionIds.has(r.session_id)).toBe(true));
  });

  it("keeps synthetic session summaries consistent with their rounds", () => {
    for (const session of seed.sessions) {
      const rounds = seed.rounds.filter((round) => round.session_id === session.session_id);
      const sum = (field: "tta" | "booked" | "bonus_action" | "fee_paid" | "result") =>
        rounds.reduce((total, round) => total + (round[field] ?? 0), 0);

      expect(rounds).toHaveLength(session.rounds_banked ?? 0);
      expect(sum("tta")).toBeCloseTo(session.action_offered ?? 0, 8);
      expect(sum("booked")).toBeCloseTo(session.action_booked ?? 0, 8);
      expect(sum("bonus_action")).toBeCloseTo(session.bonus_action_booked ?? 0, 8);
      expect(sum("fee_paid")).toBeCloseTo(session.collection_paid ?? 0, 8);
      expect(sum("result")).toBeCloseTo(session.gross_wl ?? 0, 8);
      expect(sum("result") - sum("fee_paid")).toBeCloseTo(session.net_pnl ?? 0, 8);
      expect(sum("booked") / sum("tta")).toBeCloseTo(session.coverage_pct ?? 0, 8);
      expect((session.buy_out ?? 0) - session.buy_in).toBeCloseTo(session.net_pnl ?? 0, 8);
    }
  });

  it("uses canonical, normalized casino names (no 'The Bicycle')", () => {
    for (const g of seed.games) {
      expect(g.casinos).not.toMatch(/the bicycle/i);
      // Each listed room is already in its canonical display form.
      expect(g.casinos).toBe(canonicalCasino(g.casinos));
    }
  });

  it("carries a baccarat listing for Hollywood Park, Bicycle, and Commerce", () => {
    const rooms = new Set(seed.games.filter((g) => /baccarat/i.test(g.name)).map((g) => g.casinos));
    expect(rooms).toContain("Hollywood Park");
    expect(rooms).toContain("Bicycle");
    expect(rooms).toContain("Commerce");
  });
});
