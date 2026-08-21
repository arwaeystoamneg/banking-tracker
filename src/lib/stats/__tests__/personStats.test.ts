import { describe, expect, it } from "vitest";
import { computePersonStats } from "@/lib/stats/personStats";
import { sessionSchema } from "@/lib/validation/schemas";

function session(
  id: string,
  loggedBy: string,
  buyIn: number,
  buyOut: number | null,
  date: string,
  timeIn = "",
  timeOut = "",
) {
  return sessionSchema.parse({
    session_id: id,
    date,
    casino: "Commerce",
    buy_in: buyIn,
    buy_out: buyOut,
    time_in: timeIn,
    time_out: timeOut,
    logged_by: loggedBy,
    logged_at: `${date}T12:00:00.000Z`,
    _row_version: 1,
  });
}

describe("computePersonStats", () => {
  it("groups names case-insensitively and excludes open sessions from cash results", () => {
    const result = computePersonStats([
      session("one", "Ray", 100, 150, "2026-01-01", "22:00", "02:00"),
      session("two", "ray", 200, null, "2026-02-01"),
      session("three", "Damon", 300, 250, "2026-03-01", "10:00", "12:30"),
    ]);

    const ray = result.find((person) => person.name === "Ray");
    expect(ray).toMatchObject({
      sessionCount: 2,
      completedCount: 1,
      winningCount: 1,
      totalMinutes: 240,
      firstDate: "2026-01-01",
      lastDate: "2026-02-01",
    });
    expect(ray?.netCash.toNumber()).toBe(50);
    expect(ray?.averageNet?.toNumber()).toBe(50);

    const damon = result.find((person) => person.name === "Damon");
    expect(damon?.netCash.toNumber()).toBe(-50);
    expect(damon?.totalMinutes).toBe(150);
  });
});
