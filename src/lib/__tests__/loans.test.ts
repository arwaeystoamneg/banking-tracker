import { describe, expect, it } from "vitest";
import { loanBalances } from "@/lib/loans";
import { loanEntrySchema, type LoanEntry } from "@/lib/validation/schemas";

let n = 0;
function entry(kind: "loan" | "repayment", from: string, to: string, amount: number, ids: [string, string] = ["", ""]): LoanEntry {
  return loanEntrySchema.parse({
    loan_entry_id: `ln${n++}`,
    date: "2026-10-26",
    kind,
    from_name: from,
    from_id: ids[0],
    to_name: to,
    to_id: ids[1],
    amount,
    recorded_by: "Ray Tang",
    recorded_at: "",
    _row_version: 1,
  });
}
const summary = (entries: LoanEntry[]) => loanBalances(entries).map((b) => `${b.debtor.name} owes ${b.creditor.name} ${b.amount.toString()}`);

describe("loanBalances", () => {
  it("a loan makes the borrower owe the lender", () => {
    expect(summary([entry("loan", "Shiva", "Damon", 20000)])).toEqual(["Damon owes Shiva 20000"]);
  });

  it("repayments reduce it, exactly, and a full payback clears it", () => {
    const loans = [entry("loan", "Shiva", "Damon", 20000), entry("repayment", "Damon", "Shiva", 5000.1), entry("repayment", "Damon", "Shiva", 0.2)];
    expect(summary(loans)).toEqual(["Damon owes Shiva 14999.7"]);
    expect(summary([...loans, entry("repayment", "Damon", "Shiva", 14999.7)])).toEqual([]);
  });

  it("nets loans in both directions and keeps pairs separate, biggest first", () => {
    expect(
      summary([
        entry("loan", "Shiva", "Damon", 20000),
        entry("loan", "Damon", "Shiva", 3000),
        entry("loan", "Ray", "Sam", 500),
      ]),
    ).toEqual(["Damon owes Shiva 17000", "Sam owes Ray 500"]);
  });

  it("matches people by account id, and by name case-insensitively otherwise", () => {
    expect(
      summary([entry("loan", "Shiva", "Damon", 100, ["", "damon"]), entry("repayment", "Damon R.", "shiva", 40, ["damon", ""])]),
    ).toEqual(["Damon R. owes Shiva 60"]);
  });

  it("an overpayment flips who owes", () => {
    expect(summary([entry("loan", "A", "B", 100), entry("repayment", "B", "A", 150)])).toEqual(["A owes B 50"]);
  });
});
