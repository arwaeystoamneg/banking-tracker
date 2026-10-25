import { describe, expect, it } from "vitest";
import type { CacheTab } from "@/offline/db";
import { isQueueTab } from "@/offline/tabConfig";
import { mergeServerRowsWithLocal } from "@/offline/cache";

describe("isQueueTab", () => {
  it("keeps the six banking tabs on the write queue", () => {
    const queued: CacheTab[] = ["games", "sidebets", "paytables", "feeSchedules", "sessions", "rounds"];
    expect(queued.every(isQueueTab)).toBe(true);
  });

  it("keeps loss tabs off the write queue so a report cannot sync without its photos", () => {
    expect(isQueueTab("lossReports")).toBe(false);
    expect(isQueueTab("lossEvidence")).toBe(false);
    expect(isQueueTab("auditLog")).toBe(false);
  });
});

describe("mergeServerRowsWithLocal", () => {
  it("keeps a locally filed loss report when the server list is still empty", () => {
    const merged = mergeServerRowsWithLocal(
      [],
      [{ loss_id: "lr_1", amount: 400 }],
      "loss_id",
      true,
    );
    expect([...merged.keys()]).toEqual(["lr_1"]);
  });

  it("keeps a row this phone just saved when the server answers from an older copy", () => {
    const merged = mergeServerRowsWithLocal(
      [{ session_id: "s_1", buy_in: 100, _row_version: 2 }, { session_id: "s_2", buy_in: 5, _row_version: 4 }],
      [{ session_id: "s_1", buy_in: 300, _row_version: 3 }, { session_id: "s_2", buy_in: 1, _row_version: 4 }],
      "session_id",
      false,
    );
    expect(merged.get("s_1")).toMatchObject({ buy_in: 300, _row_version: 3 });
    expect(merged.get("s_2")).toMatchObject({ buy_in: 5 });
  });

  it("lets the server list replace local rows for queued banking tabs", () => {
    const merged = mergeServerRowsWithLocal([], [{ session_id: "s_1" }], "session_id", false);
    expect(merged.size).toBe(0);
  });
});

