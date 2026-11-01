import { describe, expect, it } from "vitest";
import { formatMoney, parseMoneyInput } from "@/lib/decimal";
import { formatClock, formatDateRange, formatDuration, formatTimeRange, minutesSince } from "@/lib/dates";

describe("display formatting", () => {
  it("money has thousands separators", () => {
    expect(formatMoney(20000)).toBe("$20,000.00");
    expect(formatMoney(-1234567.5)).toBe("-$1,234,567.50");
    expect(formatMoney(85.5)).toBe("$85.50");
  });

  it("reads money the way people type it", () => {
    expect(parseMoneyInput("15,000")).toBe(15000);
    expect(parseMoneyInput("$17,857")).toBe(17857);
    expect(parseMoneyInput("15k")).toBe(15000);
    expect(parseMoneyInput("2.5K")).toBe(2500);
    expect(parseMoneyInput(" 85.50 ")).toBe(85.5);
    expect(parseMoneyInput("abc")).toBeNaN();
    expect(parseMoneyInput("")).toBeNaN();
    expect(parseMoneyInput("-5")).toBeNaN();
  });

  it("12-hour times", () => {
    expect(formatClock("19:00")).toBe("7:00 PM");
    expect(formatClock("00:15")).toBe("12:15 AM");
    expect(formatClock("12:05")).toBe("12:05 PM");
    expect(formatClock("7:30 PM")).toBe("7:30 PM");
    expect(formatTimeRange("19:00", "00:15")).toBe("7:00 PM – 12:15 AM");
    expect(formatTimeRange("19:00", "")).toBe("7:00 PM – now");
  });

  it("durations and date ranges", () => {
    expect(formatDuration(315)).toBe("5h 15m");
    expect(formatDuration(480)).toBe("8h");
    expect(formatDuration(20)).toBe("20m");
    expect(formatDateRange("2026-10-27", "2026-10-28")).toBe("Oct 27 – 28, 2026");
    expect(formatDateRange("2026-10-30", "2026-11-02")).toBe("Oct 30 – Nov 2, 2026");
    expect(formatDateRange("2026-10-30", "2026-10-30")).toBe("Oct 30, 2026");
  });

  it("time running", () => {
    expect(minutesSince("2026-10-30", "19:00", new Date("2026-10-30T22:20:00"))).toBe(200);
    expect(minutesSince("2026-10-30", "", new Date())).toBeNull();
  });
});
