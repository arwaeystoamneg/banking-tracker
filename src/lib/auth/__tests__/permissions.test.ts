import { describe, expect, it } from "vitest";
import {
  canReviewLossReport,
  canSeeAllLossReports,
  canSubmitLossReport,
  ownsGame,
  ownsLossReport,
  ownsSession,
} from "@/lib/auth/permissions";
import { gameSchema, sessionSchema } from "@/lib/validation/schemas";
import type { AuthUser } from "@/lib/auth/types";

const ray: AuthUser = { role: "individual", userId: "ray", name: "Ray Tang" };
const other: AuthUser = { role: "individual", userId: "other", name: "Other Person" };
const admin: AuthUser = { role: "admin", userId: "admin", name: "Admin" };
const demo: AuthUser = { role: "demo", userId: "demo", name: "Demo" };
const employee: AuthUser = { role: "employee", userId: "dana", name: "Dana Reyes" };

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

  it("lets an employee own their games and sessions the same way an individual does", () => {
    const danaGame = { ...game, owner_id: "dana", edited_by: "Dana Reyes" };
    const danaSession = { ...session, owner_id: "dana", logged_by: "Dana Reyes" };
    expect(ownsGame(employee, danaGame)).toBe(true);
    expect(ownsGame(employee, game)).toBe(false);
    expect(ownsSession(employee, danaSession)).toBe(true);
    expect(ownsSession(employee, session)).toBe(false);
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

describe("loss-report permissions", () => {
  const report = {
    owner_id: "dana",
    submitted_by: "Dana Reyes",
  };

  it("lets any real account file, and only admin decide", () => {
    expect(canSubmitLossReport(ray)).toBe(true);
    expect(canSubmitLossReport(employee)).toBe(true);
    expect(canSubmitLossReport(demo)).toBe(false);
    expect(canReviewLossReport(admin)).toBe(true);
    expect(canReviewLossReport(ray)).toBe(false);
    expect(canReviewLossReport(employee)).toBe(false);
  });

  it("lets employees see the same report queue as individuals", () => {
    expect(canSeeAllLossReports(admin)).toBe(true);
    expect(canSeeAllLossReports(ray)).toBe(true);
    expect(canSeeAllLossReports(employee)).toBe(true);
    expect(canSeeAllLossReports(demo)).toBe(false);
    expect(ownsLossReport(employee, report)).toBe(true);
    expect(ownsLossReport(ray, report)).toBe(false);
  });
});
