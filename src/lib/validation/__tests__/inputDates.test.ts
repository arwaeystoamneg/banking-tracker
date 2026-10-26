import { describe, expect, it } from "vitest";
import { reimbursementCreateSchema, sessionCreateSchema, sessionPatchSchema, sessionSchema } from "@/lib/validation/schemas";

const base = { date: "2026-10-20", buy_in: 100, time_in: "19:30", logged_by: "Ray", logged_at: "" };

describe("new input must have real dates and times", () => {
  it("accepts normal values, including H:mm and a blank time out", () => {
    expect(sessionCreateSchema.safeParse({ ...base, time_in: "7:05", time_out: "" }).success).toBe(true);
    expect(sessionPatchSchema.safeParse({ time_out: "01:30" }).success).toBe(true);
  });

  it.each([
    ["time 25:99", { time_in: "25:99" }],
    ["time 'abc'", { time_in: "abc" }],
    ["Feb 30", { date: "2026-02-30" }],
    ["a word", { date: "yesterday" }],
    ["year 9999", { date: "9999-12-31" }],
    ["time out 24:00", { time_out: "24:00" }],
  ])("rejects %s", (_, extra) => {
    expect(sessionCreateSchema.safeParse({ ...base, ...extra }).success).toBe(false);
  });

  it("checks reimbursement dates and patches too", () => {
    expect(reimbursementCreateSchema.safeParse({ date: "2026-13-01", amount: 5, requested_by: "x" }).success).toBe(false);
    expect(sessionPatchSchema.safeParse({ date: "2026-02-29" }).success).toBe(false);
  });

  it("still reads odd values already in the sheet", () => {
    expect(sessionSchema.safeParse({ ...base, session_id: "s", time_in: "7:30 PM", _row_version: 1 }).success).toBe(true);
  });
});
