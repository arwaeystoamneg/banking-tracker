import { describe, expect, it } from "vitest";
import {
  canMarkPayrollPaid,
  formatHours,
  payrollByEmployee,
  payrollState,
  sessionHours,
} from "@/lib/payroll";
import { sessionSchema, type Session } from "@/lib/validation/schemas";
import type { TeamMember } from "@/lib/auth/types";

const damon: TeamMember = { id: "damon", name: "Damon", role: "employee" };

function session(overrides: Partial<Session>): Session {
  return sessionSchema.parse({
    session_id: "s",
    date: "2026-10-10",
    buy_in: 100,
    buy_out: 120,
    time_in: "18:00",
    time_out: "22:30",
    logged_by: "Damon",
    logged_at: "2026-10-10T18:00:00Z",
    player: "Damon",
    player_id: "damon",
    _row_version: 1,
    ...overrides,
  });
}

describe("payroll", () => {
  it("only Ray and admin can mark paid", () => {
    expect(canMarkPayrollPaid({ role: "admin", userId: "admin", name: "Admin" })).toBe(true);
    expect(canMarkPayrollPaid({ role: "individual", userId: "ray", name: "Ray Tang" })).toBe(true);
    expect(canMarkPayrollPaid({ role: "individual", userId: "sam", name: "Sam" })).toBe(false);
    expect(canMarkPayrollPaid({ role: "employee", userId: "damon", name: "Damon" })).toBe(false);
  });

  it("counts hours, including past midnight", () => {
    expect(formatHours(sessionHours(session({})))).toBe("4h 30m");
    expect(formatHours(sessionHours(session({ time_in: "22:00", time_out: "02:15" })))).toBe("4h 15m");
    expect(sessionHours(session({ time_out: "" }))).toBeNull();
  });

  it("treats sessions before this month as already paid", () => {
    expect(payrollState(session({ date: "2026-09-30" }))).toBe("before_tracking");
    expect(payrollState(session({}))).toBe("unpaid");
    expect(payrollState(session({ payroll_paid_at: "2026-10-12T00:00:00Z" }))).toBe("paid");
    expect(payrollState(session({ buy_out: null, time_out: "" }))).toBe("in_progress");
  });

  it("totals unpaid hours per employee, matching legacy rows by name", () => {
    const [summary] = payrollByEmployee(
      [
        session({ session_id: "a" }),
        session({ session_id: "b", player_id: "", player: "", logged_by: "damon", time_in: "10:00", time_out: "11:00" }),
        session({ session_id: "c", date: "2026-09-01" }),
        session({ session_id: "d", player_id: "ray", player: "Ray Tang" }),
        session({ session_id: "e", time_in: "", time_out: "x", buy_out: 1 }),
      ],
      [damon],
    );
    expect(summary.unpaid.map((s) => s.session_id).sort()).toEqual(["a", "b", "e"]);
    expect(formatHours(summary.unpaidHours)).toBe("5h 30m");
    expect(summary.missingTimes).toBe(1);
  });
});
