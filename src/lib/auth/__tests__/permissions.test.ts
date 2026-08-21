import { describe, expect, it } from "vitest";
import { ownsGame, ownsSession } from "@/lib/auth/permissions";
import { gameSchema, sessionSchema } from "@/lib/validation/schemas";
import type { AuthUser } from "@/lib/auth/types";

const ray: AuthUser = { role: "individual", userId: "ray", name: "Ray Tang" };
const other: AuthUser = { role: "individual", userId: "other", name: "Other Person" };
const admin: AuthUser = { role: "admin", userId: "admin", name: "Admin" };
const demo: AuthUser = { role: "demo", userId: "demo", name: "Demo" };

const game = gameSchema.parse({
  game_id: "game-1",
  name: "Test game",
  edge_pct: 0.01,
  exposure_mult: 1,
  edited_by: "Ray Tang",
  owner_id: "ray",
  _row_version: 1,
});

const session = sessionSchema.parse({
  session_id: "session-1",
  date: "2026-08-21",
  casino: "Demo Room",
  buy_in: 1000,
  time_in: "09:00",
  logged_by: "Ray Tang",
  logged_at: "2026-08-21T16:00:00.000Z",
  owner_id: "ray",
  _row_version: 1,
});

describe("ownership permissions", () => {
  it("allows owners and admins but not other individuals or demo users", () => {
    expect(ownsGame(ray, game)).toBe(true);
    expect(ownsGame(admin, game)).toBe(true);
    expect(ownsGame(other, game)).toBe(false);
    expect(ownsGame(demo, game)).toBe(false);

    expect(ownsSession(ray, session)).toBe(true);
    expect(ownsSession(admin, session)).toBe(true);
    expect(ownsSession(other, session)).toBe(false);
    expect(ownsSession(demo, session)).toBe(false);
  });

  it("recognizes legacy rows by their existing person field", () => {
    expect(ownsGame(ray, { ...game, owner_id: "", edited_by: "Ray Tang" })).toBe(true);
    expect(ownsSession(ray, { ...session, owner_id: "", logged_by: "ray" })).toBe(true);
  });

  it("matches owner_id case-insensitively so sheet casing cannot lock a person out", () => {
    expect(ownsGame(ray, { ...game, owner_id: "Ray" })).toBe(true);
    expect(ownsSession(ray, { ...session, owner_id: "RAY" })).toBe(true);
    expect(ownsGame(other, { ...game, owner_id: "Ray" })).toBe(false);
  });
});
