import { describe, expect, it } from "vitest";
import { maxPayoutMultiple, payoutMultiple } from "@/lib/payout";

describe("payoutMultiple", () => {
  it("parses X:1 ratios", () => {
    expect(payoutMultiple("8000:1")).toBe(8000);
    expect(payoutMultiple("50:1")).toBe(50);
    expect(payoutMultiple("1:1")).toBe(1);
  });

  it("parses fractional and non-:1 ratios", () => {
    expect(payoutMultiple("0.95:1")).toBeCloseTo(0.95);
    expect(payoutMultiple("3:2")).toBeCloseTo(1.5);
  });

  it("parses bare numbers", () => {
    expect(payoutMultiple("50")).toBe(50);
  });

  it("returns null for non-numeric outcomes", () => {
    expect(payoutMultiple("push")).toBeNull();
    expect(payoutMultiple("TBD")).toBeNull();
    expect(payoutMultiple("Room-specific")).toBeNull();
    expect(payoutMultiple("")).toBeNull();
  });
});

describe("maxPayoutMultiple", () => {
  it("finds the worst-case tail and ignores non-numeric rows", () => {
    expect(maxPayoutMultiple(["30:1", "10:1", "1:1", "push"])).toBe(30);
    expect(maxPayoutMultiple(["8000:1", "2000:1", "5:1"])).toBe(8000);
  });

  it("returns null when nothing parses", () => {
    expect(maxPayoutMultiple(["push", "TBD"])).toBeNull();
  });
});
