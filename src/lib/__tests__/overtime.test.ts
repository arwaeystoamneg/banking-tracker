import { describe, expect, it } from "vitest";
import { overtimeByPerson, ratesFor, sessionPay, totalPay } from "@/lib/overtime";
import { sessionSchema, type Session } from "@/lib/validation/schemas";
import type { TeamMember } from "@/lib/auth/types";

const damon: TeamMember = { id: "damon", name: "Damon", role: "employee" };
const member = { member_id: "damon", hourly_rate: 60, overtime_rate: 90 };
const session = (id: string, date: string, timeIn: string, timeOut: string, extra: Partial<Session> = {}) =>
  sessionSchema.parse({
    session_id: id, date, buy_in: 100, buy_out: timeOut ? 100 : null, time_in: timeIn, time_out: timeOut,
    logged_by: "Damon", logged_at: "", player: "Damon", player_id: "damon", _row_version: 1, ...extra,
  });

describe("overtime is approved per session", () => {
  const rates = ratesFor("damon", [member])!;

  it("uses Damon's $60 base and $90 overtime; overtime defaults to 1.5× base", () => {
    expect([rates.base, rates.overtime].map(String)).toEqual(["60", "90"]);
    expect(String(ratesFor("damon", [{ ...member, overtime_rate: null }])!.overtime)).toBe("90");
    expect(ratesFor("damon", [{ ...member, hourly_rate: null }])).toBeNull();
  });

  it("a long session is base pay until overtime is approved — a request alone pays base", () => {
    expect(String(sessionPay(session("a", "2026-10-20", "18:00", "06:30"), rates))).toBe("750"); // 12.5h × $60
    expect(String(sessionPay(session("a", "2026-10-20", "18:00", "06:30", { overtime_status: "approved" }), rates))).toBe("1125"); // × $90
    expect(String(sessionPay(session("a", "2026-10-20", "18:00", "06:30", { overtime_status: "requested" }), rates))).toBe("750");
    expect(sessionPay(session("a", "2026-10-20", "", "06:30"), rates)).toBeNull();
  });

  it("lists requests and approved overtime for finished sessions since tracking began", () => {
    const sessions = [
      session("ot", "2026-10-21", "20:00", "00:30", { overtime_status: "approved" }),
      session("base", "2026-10-21", "12:00", "18:00"),
      session("paid", "2026-10-14", "20:00", "22:00", { overtime_status: "approved", payroll_paid_at: "x" }),
      session("open", "2026-10-22", "20:00", "", { overtime_status: "approved" }),
      session("old", "2026-09-20", "20:00", "22:00", { overtime_status: "approved" }),
      session("asked", "2026-10-23", "20:00", "23:00", { overtime_status: "requested" }),
    ];
    const [result] = overtimeByPerson(sessions, [damon]);
    expect(result.unpaid.map((s) => s.session_id)).toEqual(["ot"]);
    expect(result.requested.map((s) => s.session_id)).toEqual(["asked"]);
    expect(result.paid.map((s) => s.session_id)).toEqual(["paid"]);
    expect(result.unpaidMinutes).toBe(270);
    expect(String(totalPay(sessions.slice(0, 2), rates))).toBe("765"); // 4.5h × $90 + 6h × $60
  });
});
