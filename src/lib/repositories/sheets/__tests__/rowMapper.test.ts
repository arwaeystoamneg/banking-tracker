import { describe, expect, it } from "vitest";
import { sheetRowsToObjectsWithPositions } from "@/lib/repositories/sheets/rowMapper";
import { GAMES_TAB } from "@/lib/repositories/sheets/tabs";

describe("sheetRowsToObjectsWithPositions", () => {
  it("keeps physical row numbers when blank rows are present", () => {
    const rows = sheetRowsToObjectsWithPositions(GAMES_TAB, [
      ["game_id", "name", "edge_pct", "exposure_mult", "_row_version"],
      ["a", "First", "0.01", "1", "1"],
      [],
      ["b", "Second", "0.02", "2", "3"],
    ]);

    expect(rows.map((row) => [row.value.game_id, row.sheetRowNumber])).toEqual([
      ["a", 2],
      ["b", 4],
    ]);
  });
});
