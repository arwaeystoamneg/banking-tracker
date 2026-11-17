import { describe, expect, it } from "vitest";
import { compareReimbursements, reimbursementsByPerson, totalOwed, totalPaid } from "@/lib/reimbursements";
import { reimbursementSchema, type Reimbursement } from "@/lib/validation/schemas";

function row(overrides: Partial<Reimbursement>): Reimbursement {
  return reimbursementSchema.parse({
    reimbursement_id: "rb",
    date: "2026-10-20",
    payee: "Dana Reyes",
    payee_id: "dana",
    amount: 10,
    requested_by: "Dana Reyes",
    requested_at: "2026-10-20T00:00:00.000Z",
    _row_version: 1,
    ...overrides,
  });
}

describe("reimbursement totals", () => {
  const items = [
    row({ reimbursement_id: "a", amount: 0.1 }),
    row({ reimbursement_id: "b", amount: 0.2, payee: "Dana R." }),
    row({ reimbursement_id: "c", amount: 50, payee: "Lee", payee_id: "" }),
    row({ reimbursement_id: "d", amount: 999, status: "paid", paid_at: "2026-10-21T00:00:00.000Z" }),
  ];

  it("sums only what is still owed, exactly", () => {
    expect(totalOwed(items).toString()).toBe("50.3");
  });

  it("sums what has been paid", () => {
    expect(totalPaid(items).toString()).toBe("999");
  });

  it("groups by account id, then by name, most owed first, with what each has been paid", () => {
    const groups = reimbursementsByPerson(items);
    expect(groups.map((g) => [g.name, g.owed.toString(), g.owedItems.length, g.paid.toString(), g.paidCount])).toEqual([
      ["Lee", "50", 1, "0", 0],
      ["Dana Reyes", "0.3", 2, "999", 1],
    ]);
  });

  it("keeps someone who is all paid up, and lists what Pay all settles oldest first", () => {
    const groups = reimbursementsByPerson([
      row({ reimbursement_id: "late", date: "2026-10-22" }),
      row({ reimbursement_id: "early", date: "2026-10-02" }),
      row({ reimbursement_id: "done", payee: "Lee", payee_id: "lee", status: "paid", paid_at: "2026-10-21T00:00:00.000Z" }),
    ]);
    expect(groups.map((g) => [g.name, g.owedItems.map((i) => i.reimbursement_id)])).toEqual([
      ["Dana Reyes", ["early", "late"]],
      ["Lee", []],
    ]);
  });

  it("lists owed before paid, oldest owed first", () => {
    const sorted = [
      row({ reimbursement_id: "paid", status: "paid", paid_at: "2026-10-21" }),
      row({ reimbursement_id: "new", date: "2026-10-21" }),
      row({ reimbursement_id: "old", date: "2026-10-01" }),
    ].sort(compareReimbursements);
    expect(sorted.map((r) => r.reimbursement_id)).toEqual(["old", "new", "paid"]);
  });
});
