import { describe, expect, it } from "vitest";
import { queueItemBelongsToUser, queueItemMatchesPrincipal, type LegacyOwnerTables } from "@/offline/legacyQueue";
import type { AuthUser } from "@/lib/auth/types";
import type { WriteQueueItem } from "@/offline/db";

const ray: AuthUser = { role: "individual", userId: "ray", name: "Ray Tang" };
const other: AuthUser = { role: "individual", userId: "other", name: "Other Person" };
const admin: AuthUser = { role: "admin", userId: "admin", name: "Admin" };
const demo: AuthUser = { role: "demo", userId: "demo", name: "Demo" };

const emptyTables: LegacyOwnerTables = {
  games: [],
  sidebets: [],
  paytables: [],
  feeSchedules: [],
  sessions: [],
  rounds: [],
};

function item(partial: Partial<WriteQueueItem> & Pick<WriteQueueItem, "tab" | "targetId">): WriteQueueItem {
  return {
    op: "create",
    payload: {},
    status: "pending",
    createdAt: "2026-08-21T00:00:00.000Z",
    ...partial,
  };
}

describe("queueItemBelongsToUser", () => {
  it("gives a partner their own pending session, not the admin", () => {
    const queued = item({
      tab: "sessions",
      targetId: "s1",
      payload: { logged_by: "Ray Tang", owner_id: "ray" },
    });
    expect(queueItemBelongsToUser(queued, ray, emptyTables)).toBe(true);
    expect(queueItemBelongsToUser(queued, admin, emptyTables)).toBe(false);
    expect(queueItemBelongsToUser(queued, other, emptyTables)).toBe(false);
  });

  it("matches a legacy session by logged_by name when owner_id is empty", () => {
    const queued = item({
      tab: "sessions",
      targetId: "s1",
      payload: { logged_by: "Ray Tang", owner_id: "" },
    });
    expect(queueItemBelongsToUser(queued, ray, emptyTables)).toBe(true);
    expect(queueItemBelongsToUser(queued, admin, emptyTables)).toBe(false);
  });

  it("attributes a round through its parent session", () => {
    const tables: LegacyOwnerTables = {
      ...emptyTables,
      sessions: [{ session_id: "s1", owner_id: "ray", logged_by: "Ray Tang" }],
    };
    const queued = item({
      tab: "rounds",
      targetId: "r1",
      op: "update",
      payload: { session_id: "s1", tta: 100 },
    });
    expect(queueItemBelongsToUser(queued, ray, tables)).toBe(true);
    expect(queueItemBelongsToUser(queued, admin, tables)).toBe(false);
  });

  it("lets admin claim only unattributed leftovers", () => {
    const orphan = item({ tab: "sessions", targetId: "s1", payload: {} });
    expect(queueItemBelongsToUser(orphan, admin, emptyTables)).toBe(true);
    expect(queueItemBelongsToUser(orphan, ray, emptyTables)).toBe(false);
  });

  it("never claims writes for the public demo", () => {
    const queued = item({
      tab: "sessions",
      targetId: "s1",
      payload: { logged_by: "Demo", owner_id: "demo" },
    });
    expect(queueItemBelongsToUser(queued, demo, emptyTables)).toBe(false);
  });
});

describe("queueItemMatchesPrincipal", () => {
  it("keeps untagged items in a partitioned user database", () => {
    expect(queueItemMatchesPrincipal({}, "ray")).toBe(true);
    expect(queueItemMatchesPrincipal({ principalId: "ray" }, "ray")).toBe(true);
    expect(queueItemMatchesPrincipal({ principalId: "admin" }, "ray")).toBe(false);
  });
});
