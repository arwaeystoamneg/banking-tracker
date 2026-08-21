import { describe, expect, it } from "vitest";
import { fitWithin, sha256Hex } from "@/lib/blob/image";

describe("fitWithin", () => {
  it("scales the long edge down to the cap and keeps aspect ratio", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("does not upscale a photo already inside the cap", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe("sha256Hex", () => {
  it("hashes the given bytes (NIST 'abc' test vector)", async () => {
    const bytes = new TextEncoder().encode("abc");
    await expect(sha256Hex(bytes)).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
