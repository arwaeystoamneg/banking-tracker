import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultTheme, storedTheme, storeTheme } from "@/lib/theme";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

let local: Storage;
let session: Storage;
beforeEach(() => {
  local = memoryStorage();
  session = memoryStorage();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
});

describe("themes", () => {
  it("Damon defaults to pride, everyone else to normal", () => {
    expect(defaultTheme("damon")).toBe("pride");
    expect(defaultTheme("ray")).toBe("normal");
  });

  it("Damon's switch lasts only for this visit; a new app open is pride again", () => {
    storeTheme("damon", "normal");
    expect(storedTheme("damon")).toBe("normal");
    expect(local.getItem("cbt_theme_damon")).toBeNull();
    vi.stubGlobal("sessionStorage", memoryStorage()); // the app was closed and reopened
    expect(storedTheme("damon") ?? defaultTheme("damon")).toBe("pride");
  });

  it("everyone else's choice is remembered across opens", () => {
    storeTheme("ray", "halloween");
    vi.stubGlobal("sessionStorage", memoryStorage());
    expect(storedTheme("ray")).toBe("halloween");
  });

  it("ignores junk and blocked storage", () => {
    local.setItem("cbt_theme_ray", "neon");
    expect(storedTheme("ray")).toBeNull();
    vi.stubGlobal("localStorage", undefined);
    expect(storedTheme("ray")).toBeNull();
    expect(() => storeTheme("ray", "pride")).not.toThrow();
  });
});
