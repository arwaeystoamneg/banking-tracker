import { describe, expect, it, vi } from "vitest";
import { createTtlCache } from "@/lib/repositories/sheets/ttlCache";

describe("createTtlCache", () => {
  it("shares one load across concurrent and back-to-back calls until it expires", async () => {
    let clock = 0;
    const cache = createTtlCache<number>(5_000, () => clock);
    const load = vi.fn(async () => 42);
    await Promise.all([cache.get("s", load), cache.get("s", load), cache.get("s", load)]);
    clock = 4_999;
    await cache.get("s", load);
    expect(load).toHaveBeenCalledTimes(1);
    clock = 5_000;
    await cache.get("s", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reloads right after invalidate, and keeps keys separate", async () => {
    const cache = createTtlCache<string>(60_000);
    const load = vi.fn(async () => "x");
    await cache.get("live", load);
    await cache.get("demo", load);
    cache.invalidate("live");
    await cache.get("live", load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("does not keep a failed load", async () => {
    const cache = createTtlCache<string>(60_000);
    await expect(cache.get("s", async () => Promise.reject(new Error("quota")))).rejects.toThrow("quota");
    await expect(cache.get("s", async () => "ok")).resolves.toBe("ok");
  });
});
