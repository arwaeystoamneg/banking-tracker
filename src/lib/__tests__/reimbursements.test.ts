import { describe, expect, it } from "vitest";
import { compareReimbursements, owedByPerson, totalOwed } from "@/lib/reimbursements";
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

  it("groups by account id, then by name, largest first", () => {
    const groups = owedByPerson(items);
    expect(groups.map((g) => [g.name, g.total.toString(), g.count])).toEqual([
      ["Lee", "50", 1],
      ["Dana Reyes", "0.3", 2],
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
