import { describe, expect, it } from "vitest";
import { rowVersionMatches, salvagePaytableRow } from "@/lib/paytableRow";

describe("salvagePaytableRow", () => {
  it("returns null when the row has no id", () => {
    expect(salvagePaytableRow({ outcome: "Pair", payout: "TBD" })).toBeNull();
  });

  it("recovers a row with an empty outcome so it can be deleted", () => {
    const row = salvagePaytableRow({
      paytable_id: "pt_bad",
      sidebet_id: "sb_x",
      ordinal: "",
      outcome: "",
      payout: "TBD",
      _row_version: "1",
    });
    expect(row).toMatchObject({
      paytable_id: "pt_bad",
      sidebet_id: "sb_x",
      ordinal: 0,
      outcome: "(invalid)",
      payout: "TBD",
      _row_version: 1,
    });
  });
});

describe("rowVersionMatches", () => {
  it("requires an exact match when the stored version is a real integer", () => {
    expect(rowVersionMatches(4, 4)).toBe(true);
    expect(rowVersionMatches(4, 3)).toBe(false);
  });

  it("allows a cleanup delete when the stored version is garbage", () => {
    expect(rowVersionMatches(NaN, 1)).toBe(true);
    expect(rowVersionMatches(0, 1)).toBe(true);
    expect(rowVersionMatches("", 1)).toBe(true);
  });
});
