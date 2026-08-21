import { describe, expect, it } from "vitest";
import type { CacheTab } from "@/offline/db";
import { isQueueTab } from "@/offline/tabConfig";

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
