import { describe, expect, it } from "vitest";
import { applyExpenses, NO_TRIP, pnlByTrip } from "@/lib/stats/tripPnl";
import { cumulativePnl } from "@/lib/stats/resultStats";
import { sessionSchema, type Session } from "@/lib/validation/schemas";
import type { TeamMember } from "@/lib/auth/types";

const damon: TeamMember = { id: "damon", name: "Damon", role: "employee" };
const members = [{ member_id: "damon", hourly_rate: 60, overtime_rate: null }];
const session = (id: string, date: string, buyOut: number | null, extra: Partial<Session> = {}) =>
  sessionSchema.parse({
    session_id: id, date, casino: "M8trix", buy_in: 10000, buy_out: buyOut, time_in: "18:00", time_out: buyOut === null ? "" : "22:00",
    logged_by: "Damon", logged_at: "", player: "Damon", player_id: "damon", _row_version: 1, ...extra,
  });
const expense = (date: string, amount: number, session_id = "") => ({ date, amount, session_id });

describe("pnlByTrip", () => {
  const sessions = [
    session("a", "2026-11-01", 13000, { trip: "LA" }), // +3000, 4h × $60 = 240 pay
    session("b", "2026-11-03", 9000, { trip: "LA" }), // −1000, 240 pay
    session("c", "2026-11-10", 10500), // +500, 240 pay, no trip
    session("r", "2026-11-10", 11000, { player: "Ray Tang", player_id: "ray" }), // +1000, not on payroll
    session("open", "2026-11-11", null, { trip: "LA" }),
  ];

  it("splits gross, pay and expenses by trip and totals them", () => {
    const { rows, total } = pnlByTrip({
      sessions,
      reimbursements: [expense("2026-11-02", 300), expense("2026-11-10", 50, "c"), expense("2026-12-01", 20)],
      people: [damon],
      members,
    });
    const la = rows.find((row) => row.label === "LA")!;
    expect(la).toMatchObject({ sessions: 2, hours: 8, gross: 2000, pay: 480, expenses: 300, net: 1220 });
    const loose = rows.find((row) => row.label === NO_TRIP)!;
    expect(loose).toMatchObject({ sessions: 2, gross: 1500, pay: 240, expenses: 70, net: 1190 });
    expect(total).toMatchObject({ sessions: 4, gross: 3500, pay: 720, expenses: 370, net: 2410 });
  });

  it("counts payroll sessions it can't price instead of guessing", () => {
    const { total } = pnlByTrip({ sessions, reimbursements: [], people: [damon], members: [] });
    expect(total).toMatchObject({ pay: 0, payUnknown: 3, net: 3500 });
  });
});

describe("applyExpenses", () => {
  it("takes session-linked costs off that session and returns the rest by date for the chart", () => {
    const sessions = [session("a", "2026-11-01", 13000), session("open", "2026-11-02", null)];
    const result = applyExpenses(sessions, [expense("2026-11-01", 100, "a"), expense("2026-11-02", 40, "open"), expense("2026-11-05", 60)]);
    expect(result.sessions[0].buy_out).toBe(12900);
    expect(result.sessions[1]).toBe(sessions[1]);
    expect(result.unlinked).toEqual([
      { date: "2026-11-02", amount: 40 },
      { date: "2026-11-05", amount: 60 },
    ]);
    const points = cumulativePnl(result.sessions, result.unlinked.map((row) => ({ ...row, amount: -row.amount })));
    expect(points.map((point) => point.total)).toEqual([2900, 2860, 2800]);
  });
});
