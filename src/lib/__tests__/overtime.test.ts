import { describe, expect, it } from "vitest";
import { overtimeByPerson, payFor, payForSessions, ratesFor, splitWeek, weekStartOf } from "@/lib/overtime";
import { sessionSchema, type Session } from "@/lib/validation/schemas";
import type { TeamMember } from "@/lib/auth/types";

const h = (hours: number) => hours * 60;
const day = (date: string, hours: number) => ({ date, minutes: h(hours) });
const totals = (days: ReturnType<typeof splitWeek>) => ({
  regular: days.reduce((t, x) => t + x.regular, 0) / 60,
  overtime: days.reduce((t, x) => t + x.overtime, 0) / 60,
  doubleTime: days.reduce((t, x) => t + x.doubleTime, 0) / 60,
});

describe("California daily and weekly overtime", () => {
  it("over 8h is 1.5x and over 12h is 2x", () => {
    expect(totals(splitWeek([day("2026-10-19", 14)]))).toEqual({ regular: 8, overtime: 4, doubleTime: 2 });
  });

  it("regular hours past 40 in a week become overtime, without double counting daily overtime", () => {
    // Five 9h days: 5 × 1h daily OT, 40 regular → no extra weekly OT.
    expect(totals(splitWeek(["19", "20", "21", "22", "23"].map((d) => day(`2026-10-${d}`, 9))))).toEqual({ regular: 40, overtime: 5, doubleTime: 0 });
    // Six 8h days: 48 regular hours → the last 8 become weekly OT.
    expect(totals(splitWeek(["18", "19", "20", "21", "22", "23"].map((d) => day(`2026-10-${d}`, 8))))).toEqual({ regular: 40, overtime: 8, doubleTime: 0 });
  });

  it("the 7th day worked in a week: first 8h at 1.5x, the rest at 2x", () => {
    const week = ["18", "19", "20", "21", "22", "23", "24"].map((d) => day(`2026-10-${d}`, d === "24" ? 10 : 5));
    const days = splitWeek(week);
    expect(days[6]).toMatchObject({ seventhDay: true, regular: 0, overtime: h(8), doubleTime: h(2) });
    expect(totals(days)).toEqual({ regular: 30, overtime: 8, doubleTime: 2 });
  });

  it("weeks run Sunday to Saturday", () => {
    expect(weekStartOf("2026-10-24")).toBe("2026-10-18"); // Saturday
    expect(weekStartOf("2026-10-25")).toBe("2026-10-25"); // Sunday
  });
});

describe("overtimeByPerson", () => {
  const damon: TeamMember = { id: "damon", name: "Damon", role: "employee" };
  const session = (id: string, date: string, timeIn: string, timeOut: string, extra: Partial<Session> = {}) =>
    sessionSchema.parse({
      session_id: id, date, buy_in: 100, buy_out: timeOut ? 100 : null, time_in: timeIn, time_out: timeOut,
      logged_by: "Damon", logged_at: "", player: "Damon", player_id: "damon", _row_version: 1, ...extra,
    });

  it("adds same-day sessions together, skips open ones, and tracks paid weeks", () => {
    const [result] = overtimeByPerson(
      [
        session("a", "2026-10-20", "12:00", "18:00"),
        session("b", "2026-10-20", "19:00", "01:30"), // past midnight: counts to the 20th → 12.5h that day
        session("c", "2026-10-22", "19:00", ""), // still open
        session("d", "2026-10-13", "18:00", "03:00", { payroll_paid_at: "2026-10-15" }), // 9h, paid week
        session("e", "2026-09-29", "18:00", "08:00"), // before payroll tracking
      ],
      [damon],
    );
    expect(result.weeks.map((w) => [w.weekStart, w.overtime / 60, w.doubleTime / 60, w.paid, w.inProgress])).toEqual([
      ["2026-10-18", 4, 0.5, false, 1],
      ["2026-10-11", 1, 0, true, 0],
    ]);
    expect(result.unpaidOvertime / 60).toBe(4);
    expect(result.unpaidDoubleTime / 60).toBe(0.5);
  });
});

describe("pay amounts", () => {
  const damon: TeamMember = { id: "damon", name: "Damon", role: "employee" };
  const member = { member_id: "damon", hourly_rate: 60, overtime_rate: 90, double_time_rate: null };
  const session = (id: string, date: string, timeIn: string, timeOut: string) =>
    sessionSchema.parse({
      session_id: id, date, buy_in: 100, buy_out: 100, time_in: timeIn, time_out: timeOut,
      logged_by: "Damon", logged_at: "", player: "Damon", player_id: "damon", _row_version: 1,
    });

  it("uses $60 base, $90 overtime, and defaults double time to 2× base", () => {
    const rates = ratesFor("damon", [member])!;
    expect([rates.base, rates.overtime, rates.doubleTime].map(String)).toEqual(["60", "90", "120"]);
    expect(ratesFor("damon", [{ ...member, hourly_rate: null }])).toBeNull();
  });

  it("prices each session by the hours it actually put over the limit", () => {
    // Same day: 6h then 6.5h → first session all regular, second 2h regular + 4h OT + 0.5h double time.
    const [result] = overtimeByPerson([session("a", "2026-10-20", "12:00", "18:00"), session("b", "2026-10-20", "19:00", "01:30")], [damon]);
    expect(result.sessionSplits.get("a")).toEqual({ regular: 360, overtime: 0, doubleTime: 0 });
    expect(result.sessionSplits.get("b")).toEqual({ regular: 120, overtime: 240, doubleTime: 30 });
    const rates = ratesFor("damon", [member])!;
    expect(String(payFor(result.sessionSplits.get("b")!, rates))).toBe("540"); // 2×60 + 4×90 + 0.5×120
    expect(String(payForSessions(["a", "b"], result.sessionSplits, rates))).toBe("900");
  });
});
