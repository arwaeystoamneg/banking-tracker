import { describe, expect, it } from "vitest";
import {
  canonicalCasino,
  canonicalCasinoList,
  canonicalPerson,
  normalizeCasinoKey,
  normalizePersonKey,
} from "@/lib/names";

describe("casino normalization", () => {
  it("collapses capitalization and whitespace to one key", () => {
    const variants = ["Hollywood Park", "hollywood park", "HOLLYWOOD  PARK ", "hollywood park casino"];
    const keys = new Set(variants.map(normalizeCasinoKey));
    expect(keys.size).toBe(1);
  });

  it("drops a leading 'the' — 'The Bicycle' and 'Bicycle' are the same room", () => {
    expect(normalizeCasinoKey("The Bicycle")).toBe(normalizeCasinoKey("Bicycle"));
    expect(canonicalCasino("The Bicycle")).toBe("Bicycle");
    expect(canonicalCasino("the bicycle")).toBe("Bicycle");
  });

  it("snaps known shorthands to their canonical name", () => {
    expect(canonicalCasino("HPC")).toBe("Hollywood Park");
    expect(canonicalCasino("hpc")).toBe("Hollywood Park");
    expect(canonicalCasino("Bike")).toBe("Bicycle");
  });

  it("absorbs curated autocorrect/typo forms of known rooms", () => {
    expect(canonicalCasino("Commerse")).toBe("Commerce");
    expect(canonicalCasino("Hollywod Park")).toBe("Hollywood Park");
    expect(canonicalCasino("bicyle")).toBe("Bicycle");
  });

  it("does not merge genuinely different rooms", () => {
    // Gardens (a room) vs Gardena (the city where Hustler sits) are one edit apart but distinct —
    // curated aliases (not edit-distance) is what keeps them separate.
    expect(canonicalCasino("Gardena")).toBe("Gardena");
    expect(canonicalCasino("Gardena")).not.toBe("Gardens");
  });

  it("title-cases unknown rooms deterministically", () => {
    expect(canonicalCasino("normandie club")).toBe("Normandie");
  });

  it("de-duplicates a pipe-delimited list by canonical room", () => {
    expect(canonicalCasinoList("The Bicycle|bicycle|Commerce")).toEqual(["Bicycle", "Commerce"]);
  });
});

describe("person normalization", () => {
  it("groups case/spacing variants under one key", () => {
    expect(normalizePersonKey("Ray")).toBe(normalizePersonKey("ray"));
    expect(normalizePersonKey("Ray  Tang ")).toBe(normalizePersonKey("ray tang"));
  });

  it("keeps distinct names distinct", () => {
    expect(normalizePersonKey("Ray")).not.toBe(normalizePersonKey("Ray Tang"));
  });

  it("renders one consistent display form", () => {
    expect(canonicalPerson("ray tang")).toBe("Ray Tang");
    expect(canonicalPerson("RAY")).toBe("Ray");
  });
});
