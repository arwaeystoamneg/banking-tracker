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
    seed.sidebets.forEach((s) => expect(gameIds.has(s.game_id)).toBe(true));
    seed.paytables.forEach((p) => expect(sidebetIds.has(p.sidebet_id)).toBe(true));
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
