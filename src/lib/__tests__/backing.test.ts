import { describe, expect, it } from "vitest";
import { addSplit, backingProblem, describeBacking, formatBacking, formatBackerPaid, normalizeBacking, parseBacking, parseBackerPaid, paySlips, sortedTotals, splitAmount, UNASSIGNED } from "@/lib/backing";
import { d } from "@/lib/decimal";

describe("backing", () => {
  it("reads and writes Name:percent|Name:percent, tolerating hand edits", () => {
    expect(parseBacking("Ray Tang:80|Damon:20")).toEqual([
      { name: "Ray Tang", pct: 80 },
      { name: "Damon", pct: 20 },
    ]);
    expect(parseBacking(" Ray Tang : 50% | Ben:50 | junk ")).toEqual([
      { name: "Ray Tang", pct: 50 },
      { name: "Ben", pct: 50 },
    ]);
    expect(parseBacking("")).toEqual([]);
    expect(formatBacking([{ name: "Ray Tang", pct: 33.333 }, { name: "A|B", pct: 66.667 }])).toBe("Ray Tang:33.33|A B:66.67");
    expect(describeBacking("")).toBe(UNASSIGNED);
  });

  it("insists on 100% and unique names", () => {
    expect(backingProblem([{ name: "Ray", pct: 60 }, { name: "Damon", pct: 30 }])).toMatch(/90%/);
    expect(backingProblem([{ name: "Ray", pct: 50 }, { name: "ray", pct: 50 }])).toMatch(/twice/);
    expect(backingProblem([])).toBeNull();
    expect(normalizeBacking(" Ray : 70 | Damon:30 ")).toBe("Ray:70|Damon:30");
    expect(() => normalizeBacking("Ray:70")).toThrow(/70%/);
    expect(() => normalizeBacking("nonsense")).toThrow(/Couldn't read/);
  });

  it("splits to the cent and the pieces add back up", () => {
    const parts = splitAmount(100, "A:33.33|B:33.33|C:33.34");
    const total = [...parts.values()].reduce((sum, piece) => sum.plus(piece), d(0));
    expect(total.toString()).toBe("100");
    expect(splitAmount(250, "").get(UNASSIGNED)!.toString()).toBe("250");
  });

  it("totals per backer across many items, unassigned last", () => {
    const totals = new Map();
    addSplit(totals, 480, "Ray Tang:80|Damon:20");
    addSplit(totals, 240, "");
    addSplit(totals, 100, "Ray Tang:50|Ben:50");
    expect(sortedTotals(totals).map((row) => [row.name, row.amount.toNumber()])).toEqual([
      ["Ray Tang", 434],
      ["Damon", 96],
      ["Ben", 50],
      [UNASSIGNED, 240],
    ]);
  });
});

describe("pay slips", () => {
  it("gives each backer their share and tracks who has paid", () => {
    const session = { backing: "Ray:50|Shiva Oswal:50", backer_paid: "Ray@2026-11-24T05:00:00.000Z", payroll_paid_at: "" };
    expect(paySlips(session, 300).map((slip) => [slip.name, slip.amount.toNumber(), Boolean(slip.paidAt)])).toEqual([
      ["Ray", 150, true],
      ["Shiva Oswal", 150, false],
    ]);
    expect(formatBackerPaid(parseBackerPaid(session.backer_paid))).toBe(session.backer_paid);
  });

  it("treats a session paid before slips existed as fully paid, and an unassigned one as a single slip", () => {
    const old = paySlips({ backing: "Ray:50|Shiva Oswal:50", backer_paid: "", payroll_paid_at: "2026-11-01" }, 100);
    expect(old.every((slip) => slip.paidAt === "2026-11-01")).toBe(true);
    expect(paySlips({ backing: "", payroll_paid_at: "" }, 100)).toEqual([{ name: UNASSIGNED, amount: d(100), paidAt: "" }]);
  });
});
