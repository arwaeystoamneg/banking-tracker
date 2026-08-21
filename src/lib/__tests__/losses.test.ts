import { describe, expect, it } from "vitest";
import { compareLossQueue, findUnreportedLossSessions, formatReportingDelay, reportingDelayMs } from "@/lib/losses";
import { lossReportSchema, sessionSchema, type LossReport, type Session } from "@/lib/validation/schemas";

function report(partial: Partial<LossReport> & Pick<LossReport, "loss_id" | "occurred_at" | "reported_at" | "status">): LossReport {
  return lossReportSchema.parse({
    amount: 200,
    submitted_by: "Dana",
    _row_version: 1,
    ...partial,
  });
}

function session(partial: Partial<Session> & Pick<Session, "session_id" | "gross_wl">): Session {
  return sessionSchema.parse({
    date: "2026-08-21",
    casino: "Hollywood Park",
    buy_in: 8000,
    time_in: "20:00",
    logged_by: "Ray",
    logged_at: "2026-08-21T20:00:00.000Z",
    _row_version: 1,
    ...partial,
  });
}

describe("reportingDelayMs", () => {
  it("is the gap between claimed time and server receipt", () => {
    expect(
      reportingDelayMs({
        occurred_at: "2026-08-21T20:00:00.000Z",
        reported_at: "2026-08-21T22:30:00.000Z",
      }),
    ).toBe(2.5 * 60 * 60 * 1000);
  });
});

describe("formatReportingDelay", () => {
  it("labels a same-minute filing as immediate", () => {
    expect(formatReportingDelay(20_000)).toBe("filed immediately");
  });

  it("uses hours past one hour", () => {
    expect(formatReportingDelay(3 * 60 * 60 * 1000)).toBe("3h later");
  });
});

describe("compareLossQueue", () => {
  it("puts open reports ahead of settled ones, then the longest delay first", () => {
    const verified = report({
      loss_id: "lr_v",
      status: "verified",
      occurred_at: "2026-08-21T10:00:00.000Z",
      reported_at: "2026-08-21T18:00:00.000Z",
    });
    const submittedLate = report({
      loss_id: "lr_late",
      status: "submitted",
      occurred_at: "2026-08-21T10:00:00.000Z",
      reported_at: "2026-08-21T16:00:00.000Z",
    });
    const submittedSoon = report({
      loss_id: "lr_soon",
      status: "submitted",
      occurred_at: "2026-08-21T15:00:00.000Z",
      reported_at: "2026-08-21T15:10:00.000Z",
    });
    const sorted = [verified, submittedSoon, submittedLate].sort(compareLossQueue);
    expect(sorted.map((row) => row.loss_id)).toEqual(["lr_late", "lr_soon", "lr_v"]);
  });
});

describe("findUnreportedLossSessions", () => {
  it("flags a large negative gross W/L with no linked report", () => {
    const hole = session({ session_id: "s_hole", gross_wl: -1200 });
    const small = session({ session_id: "s_small", gross_wl: -80 });
    const linked = session({ session_id: "s_linked", gross_wl: -2000 });
    const reports = [
      report({
        loss_id: "lr1",
        session_id: "s_linked",
        occurred_at: "2026-08-21T20:00:00.000Z",
        reported_at: "2026-08-21T20:10:00.000Z",
        status: "submitted",
      }),
    ];
    expect(findUnreportedLossSessions([hole, small, linked], reports).map((row) => row.session_id)).toEqual(["s_hole"]);
  });

  it("does not treat an unlinked report as covering a session", () => {
    const hole = session({ session_id: "s_hole", gross_wl: -800 });
    const reports = [
      report({
        loss_id: "lr1",
        session_id: "",
        occurred_at: "2026-08-21T20:00:00.000Z",
        reported_at: "2026-08-21T20:10:00.000Z",
        status: "submitted",
        amount: 800,
      }),
    ];
    expect(findUnreportedLossSessions([hole], reports)).toHaveLength(1);
  });
});
