import { detectGameFamily } from "@/lib/gameFamily";
import { describe, expect, it } from "vitest";
import {
  HPC_FROG_EDGE,
  HPC_FROG_PAYOUTS,
  HPC_FROG_PAYOUTS_STANDARD,
  HPC_FROG_STANDARD_EDGE,
  hpcFrogPayoutFromRows,
  matchHpcFrogSidebet,
  realizedHpcFrogEdge,
} from "@/lib/math/baccaratHpc";

describe("Hollywood Park 9/1 · 9/7 · 8/6", () => {
  it("standard Golden Frog pays match Wizard house edges", () => {
    expect(HPC_FROG_STANDARD_EDGE.eightSix).toBeCloseTo(0.217887, 4);
    expect(HPC_FROG_STANDARD_EDGE.nineSeven).toBeCloseTo(0.081032, 4);
    expect(HPC_FROG_STANDARD_EDGE.nineOne).toBeCloseTo(0.138686, 4);
  });

  it("HPC 9/7 at 30:1 is the 44% house edge", () => {
    expect(HPC_FROG_PAYOUTS.nineSeven).toBe(30);
    expect(HPC_FROG_EDGE.nineSeven).toBeCloseTo(0.441411, 4);
  });

  it("HPC 9/1 at 100:1 is ~42.4% house", () => {
    expect(HPC_FROG_PAYOUTS.nineOne).toBe(100);
    expect(HPC_FROG_EDGE.nineOne).toBeCloseTo(0.423896, 4);
  });

  it("8/6 is unchanged at 25:1 / 21.79%", () => {
    expect(HPC_FROG_PAYOUTS.eightSix).toBe(HPC_FROG_PAYOUTS_STANDARD.eightSix);
    expect(HPC_FROG_EDGE.eightSix).toBeCloseTo(HPC_FROG_STANDARD_EDGE.eightSix, 9);
  });

  it("short-pay raises the bank's edge vs the published table", () => {
    expect(HPC_FROG_EDGE.nineSeven).toBeGreaterThan(HPC_FROG_STANDARD_EDGE.nineSeven);
    expect(HPC_FROG_EDGE.nineOne).toBeGreaterThan(HPC_FROG_STANDARD_EDGE.nineOne);
  });

  it("matches felt names", () => {
    expect(matchHpcFrogSidebet("9/7")).toBe("nineSeven");
    expect(matchHpcFrogSidebet("9/1")).toBe("nineOne");
    expect(matchHpcFrogSidebet("9/7 44 HE")).toBe("nineSeven");
    expect(matchHpcFrogSidebet("9/1 44 HE")).toBe("nineOne");
    expect(matchHpcFrogSidebet("8/6")).toBe("eightSix");
    expect(matchHpcFrogSidebet("9-7")).toBe("nineSeven");
    expect(matchHpcFrogSidebet("Dragon 7")).toBeNull();
    expect(matchHpcFrogSidebet("Tie")).toBeNull();
  });

  it("reads the HPC felt payout from a single paytable row", () => {
    expect(hpcFrogPayoutFromRows("nineSeven", [{ outcome: "9/7 (2-card 9 over 7)", payout: "30:1" }])).toBe(30);
    expect(hpcFrogPayoutFromRows("nineOne", [{ outcome: "9/1 (3-card 9 over 1)", payout: "100:1" }])).toBe(100);
    expect(hpcFrogPayoutFromRows("eightSix", [{ outcome: "8/6 (any 8 over 6)", payout: "25:1" }])).toBe(25);
  });

  it("underbanking raises the realized edge", () => {
    const full = realizedHpcFrogEdge("nineOne", 100, Infinity);
    const tight = realizedHpcFrogEdge("nineOne", 100, 10);
    expect(tight).toBeGreaterThan(full);
  });
});

describe("Hollywood Park baccarat is its own calculator", () => {
  it("splits HPC from Bicycle/Commerce baccarat", () => {
    expect(detectGameFamily("Baccarat (Hollywood Park)")).toBe("baccaratHpc");
    expect(detectGameFamily("Baccarat")).toBe("baccarat");
  });
});
