import { describe, expect, it } from "vitest";
import { highValueSidebetTag, isHighValueSidebet, sidebetAppliesAtCasino } from "@/lib/gameFamily";

describe("isHighValueSidebet", () => {
  it("flags BBJ and HPC 44 HE short-pays, not a standard 9/7 or 9/1", () => {
    expect(isHighValueSidebet("Bad Beat Jackpot")).toBe(true);
    expect(isHighValueSidebet("9/7 44 HE")).toBe(true);
    expect(isHighValueSidebet("9/1 44 HE")).toBe(true);
    expect(highValueSidebetTag("9/7 44 HE")).toBe("44 HE");
    expect(highValueSidebetTag("Bad Beat Jackpot")).toBe("BBJ");
    expect(isHighValueSidebet("9/7")).toBe(false);
    expect(isHighValueSidebet("9/1")).toBe(false);
    expect(isHighValueSidebet("9-7 (2-card)")).toBe(false);
  });

  it("does not flag ordinary EZ or trips lines", () => {
    expect(isHighValueSidebet("Dragon 7")).toBe(false);
    expect(isHighValueSidebet("Panda 8")).toBe(false);
    expect(isHighValueSidebet("8/6")).toBe(false);
    expect(isHighValueSidebet("Trips (Bonus)")).toBe(false);
  });
});

describe("sidebetAppliesAtCasino", () => {
  it("keeps 44 HE short-pays at Hollywood Park only", () => {
    expect(sidebetAppliesAtCasino("9/7 44 HE", "Hollywood Park")).toBe(true);
    expect(sidebetAppliesAtCasino("9/1 44 HE", "Commerce")).toBe(false);
    expect(sidebetAppliesAtCasino("9/7 44 HE", "Bicycle")).toBe(false);
  });

  it("lets a standard 9/7 show at any room", () => {
    expect(sidebetAppliesAtCasino("9/7", "Bicycle")).toBe(true);
    expect(sidebetAppliesAtCasino("9/1", "Commerce")).toBe(true);
  });
});
