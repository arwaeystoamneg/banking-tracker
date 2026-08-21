import { describe, expect, it } from "vitest";
import { chainVersionAfterSettle } from "@/offline/queue";
import type { QueueOp, QueueTab } from "@/offline/db";

function item(
  id: number,
  op: QueueOp,
  targetId: string,
  expectedVersion?: number,
  tab: QueueTab = "games",
) {
  return { id, op, tab, targetId, expectedVersion };
}

describe("chainVersionAfterSettle", () => {
  it("advances a later same-row update after the first one settles (self-conflict fix)", () => {
    const items = [item(1, "update", "g1", 3), item(2, "update", "g1", 3)];
    const touched = chainVersionAfterSettle(items, 0, 4);
    expect(touched).toEqual([2]);
    expect(items[1].expectedVersion).toBe(4);
  });

  it("chains a create -> edit-before-sync so the edit expects v1, not v0", () => {
    const items = [item(1, "create", "g1"), item(2, "update", "g1", 0)];
    const touched = chainVersionAfterSettle(items, 0, 1);
    expect(touched).toEqual([2]);
    expect(items[1].expectedVersion).toBe(1);
  });

  it("chains across three sequential edits when applied per settle", () => {
    const items = [item(1, "update", "g1", 5), item(2, "update", "g1", 5), item(3, "update", "g1", 5)];
    chainVersionAfterSettle(items, 0, 6); // after item1 settles at 6
    expect(items[1].expectedVersion).toBe(6);
    expect(items[2].expectedVersion).toBe(6);
    chainVersionAfterSettle(items, 1, 7); // after item2 settles at 7
    expect(items[2].expectedVersion).toBe(7);
  });

  it("does not touch other rows or other tabs", () => {
    const items = [
      item(1, "update", "g1", 3),
      item(2, "update", "g2", 3),
      item(3, "update", "g1", 3, "sidebets"),
    ];
    const touched = chainVersionAfterSettle(items, 0, 4);
    expect(touched).toEqual([]);
    expect(items[1].expectedVersion).toBe(3);
    expect(items[2].expectedVersion).toBe(3);
  });

  it("never rewrites earlier items, only later ones", () => {
    const items = [item(1, "update", "g1", 3), item(2, "update", "g1", 3)];
    const touched = chainVersionAfterSettle(items, 1, 9);
    expect(touched).toEqual([]);
    expect(items[0].expectedVersion).toBe(3);
  });

  it("also advances a later delete to the same row (deletes carry a version)", () => {
    const items = [item(1, "update", "g1", 3), item(2, "delete", "g1", 3)];
    const touched = chainVersionAfterSettle(items, 0, 4);
    expect(touched).toEqual([2]);
    expect(items[1].expectedVersion).toBe(4);
  });
});
