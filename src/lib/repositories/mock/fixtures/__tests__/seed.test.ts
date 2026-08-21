import { describe, expect, it } from "vitest";
import seed from "@/lib/repositories/mock/fixtures/seed.json";
import {
  feeScheduleSchema,
  gameSchema,
  lossEvidenceSchema,
  lossReportSchema,
  auditEntrySchema,
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
      seed.lossReports.forEach((r) => lossReportSchema.parse(r));
      seed.lossEvidence.forEach((r) => lossEvidenceSchema.parse(r));
      seed.auditLog.forEach((r) => auditEntrySchema.parse(r));
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
      for (const part of g.casinos.split("|")) {
        expect(part.trim()).toBe(canonicalCasino(part.trim()));
      }
    }
  });

  it("carries a baccarat listing for Hollywood Park, Bicycle, and Commerce", () => {
    const rooms = new Set(
      seed.games
        .filter((g) => /baccarat/i.test(g.name))
        .flatMap((g) => g.casinos.split("|").map((part) => part.trim())),
    );
    expect(rooms).toContain("Hollywood Park");
    expect(rooms).toContain("Bicycle");
    expect(rooms).toContain("Commerce");
  });

  it("does not list 21st Century Baccarat", () => {
    expect(seed.games.some((g) => /21st\s*century\s*baccarat/i.test(g.name))).toBe(false);
  });

  it("puts blackjack at HPC and Commerce without Buster, and Buster only on Bicycle No Bust", () => {
    const blackjack = seed.games.find((g) => g.game_id === "gm_blackjack");
    const nobust = seed.games.find((g) => g.game_id === "gm_nobust");
    const buster = seed.sidebets.find((s) => s.sidebet_id === "sb_nobust_buster");
    expect(blackjack?.casinos.split("|").map((p) => p.trim()).sort()).toEqual(["Commerce", "Hollywood Park"]);
    expect(nobust?.casinos).toBe("Bicycle");
    expect(buster?.game_id).toBe("gm_nobust");
    expect(seed.sidebets.filter((s) => /buster/i.test(s.name)).every((s) => s.game_id === "gm_nobust")).toBe(true);
  });

  it("lists UTH at HPC, Commerce, and Bicycle, with Bad Beat only on Bicycle", () => {
    const uth = seed.games.filter((g) => /ultimate\s*texas/i.test(g.name));
    const rooms = new Set(uth.flatMap((g) => g.casinos.split("|").map((part) => part.trim())));
    expect(rooms).toEqual(new Set(["Hollywood Park", "Commerce", "Bicycle"]));
    const bbj = seed.sidebets.filter((s) => /bad\s*beat/i.test(s.name));
    expect(bbj).toHaveLength(1);
    const host = seed.games.find((g) => g.game_id === bbj[0]?.game_id);
    expect(host?.casinos).toBe("Bicycle");
    expect(
      uth
        .filter((g) => g.casinos.includes("Hollywood Park") || g.casinos.includes("Commerce"))
        .every((g) => g.game_id !== bbj[0]?.game_id),
    ).toBe(true);
  });

  it("lists 9/1 and 9/7 44 HE on Hollywood Park baccarat", () => {
    const hpcSides = seed.sidebets.filter((s) => s.game_id === "gm_baccarat_hpc").map((s) => s.name);
    expect(hpcSides).toEqual(expect.arrayContaining(["9/1 44 HE", "9/7 44 HE"]));
  });
});
