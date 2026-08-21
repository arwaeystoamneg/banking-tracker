import { describe, expect, it } from "vitest";
import { sessionCreateSchema, sessionSchema } from "@/lib/validation/schemas";

describe("session schemas", () => {
  it("fills new cash and time fields when reading a legacy session", () => {
    const parsed = sessionSchema.parse({
      session_id: "session_legacy",
      date: "2026-08-20",
      game_id: "game_old",
      bank_posted: 8000,
      logged_by: "Ray",
      logged_at: "2026-08-20T20:00:00.000Z",
      _row_version: 1,
    });

    expect(parsed.buy_in).toBe(0);
    expect(parsed.buy_out).toBeNull();
    expect(parsed.time_in).toBe("");
    expect(parsed.time_out).toBe("");
    expect(parsed).not.toHaveProperty("bank_posted");
  });

  it("requires the fields needed to start a casino session", () => {
    const valid = {
      date: "2026-08-20",
      casino: "Commerce",
      buy_in: 2000,
      time_in: "20:15",
      logged_by: "Damon",
      logged_at: "2026-08-20T20:15:00.000Z",
    };

    expect(sessionCreateSchema.parse(valid)).toMatchObject(valid);
    expect(() => sessionCreateSchema.parse({ ...valid, casino: "" })).toThrow();
    expect(() => sessionCreateSchema.parse({ ...valid, buy_in: -1 })).toThrow();
  });
});
