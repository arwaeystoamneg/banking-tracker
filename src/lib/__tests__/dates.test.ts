import { describe, expect, it } from "vitest";
import { startDateForTimeIn } from "@/lib/dates";

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
