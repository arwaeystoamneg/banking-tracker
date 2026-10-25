import { describe, expect, it } from "vitest";
import { correctFutureStartDate, startDateForTimeIn } from "@/lib/dates";

const at = (iso: string) => new Date(iso);

describe("startDateForTimeIn", () => {
  it("dates a session logged after midnight by the evening it started", () => {
    expect(startDateForTimeIn("19:30", at("2026-10-23T01:32:00"))).toBe("2026-10-22");
    expect(startDateForTimeIn("23:55", at("2026-10-01T00:10:00"))).toBe("2026-09-30");
  });

  it("keeps today when the session started earlier today", () => {
    expect(startDateForTimeIn("19:30", at("2026-10-22T21:00:00"))).toBe("2026-10-22");
    expect(startDateForTimeIn("00:15", at("2026-10-23T01:00:00"))).toBe("2026-10-23");
  });

  it("allows a few minutes of clock drift before calling it yesterday", () => {
    expect(startDateForTimeIn("21:03", at("2026-10-22T21:00:00"))).toBe("2026-10-22");
  });

  it("falls back to today without a usable time", () => {
    expect(startDateForTimeIn("", at("2026-10-22T21:00:00"))).toBe("2026-10-22");
  });
});

describe("correctFutureStartDate (cardroom time, UTC-7 in October)", () => {
  // 08:32Z on Oct 23 is 1:32am Pacific on Oct 23.
  const afterMidnight = new Date("2026-10-23T08:32:00Z");

  it("moves a start in the future back to the evening before", () => {
    expect(correctFutureStartDate("2026-10-23", "19:30", afterMidnight)).toBe("2026-10-22");
  });

  it("leaves a start that already happened", () => {
    expect(correctFutureStartDate("2026-10-22", "19:30", afterMidnight)).toBe("2026-10-22");
    expect(correctFutureStartDate("2026-10-23", "00:30", afterMidnight)).toBe("2026-10-23");
  });

  it("leaves dates more than a day ahead, and junk, untouched", () => {
    expect(correctFutureStartDate("2026-10-30", "19:30", afterMidnight)).toBe("2026-10-30");
    expect(correctFutureStartDate("2026-10-23", "", afterMidnight)).toBe("2026-10-23");
  });

  it("works across a month boundary", () => {
    expect(correctFutureStartDate("2026-11-01", "22:00", new Date("2026-11-01T08:00:00Z"))).toBe("2026-10-31");
  });
});
