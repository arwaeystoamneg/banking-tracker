import { describe, expect, it } from "vitest";
import { discordStatsTable } from "@/lib/stats/discord";
import { sessionSchema, type Session } from "@/lib/validation/schemas";

const session = (id: string, casino: string, buyOut: number, extra: Partial<Session> = {}) =>
  sessionSchema.parse({
    session_id: id, date: "2026-11-01", casino, buy_in: 10000, buy_out: buyOut, time_in: "18:00", time_out: "22:00",
    logged_by: "Damon", logged_at: "", player: "Damon", player_id: "damon", _row_version: 1, ...extra,
  });

describe("discordStatsTable", () => {
  it("is a code block with a row per player and M8trix + Bay 101 grouped", () => {
    const text = discordStatsTable({
      heading: "Stats",
      players: [
        {
          label: "Damon",
          sessions: [
            session("a", "M8trix", 12000),
            session("b", "Bay 101", 9000),
            session("c", "Artichoke Joe's", 10500),
            session("d", "Artichoke Joe's", 9500, { date: "2026-11-02" }),
          ],
        },
      ],
    });
    const lines = text.split("\n");
    expect(lines[0]).toBe("```");
    expect(lines[lines.length - 1]).toBe("```");
    expect(text).toContain("Damon");
    expect(text).toContain("  M8trix + Bay 101");
    expect(text).not.toMatch(/^ {2}M8trix {2}/m);
    expect(lines.find((line) => line.startsWith("Damon"))).toContain("+$1,000");
    // Every table row lines up: same width as the header.
    const rows = lines.filter((line) => /^(Player|Damon| {2}\S)/.test(line));
    expect(new Set(rows.map((line) => line.length)).size).toBe(1);
  });
});
