import { afterEach, describe, expect, it } from "vitest";
import { makeAuthToken, verifyAuthToken } from "@/lib/auth/passphrase";

const originalPassphrase = process.env.APP_PASSPHRASE;
const originalSecret = process.env.AUTH_COOKIE_SECRET;

afterEach(() => {
  process.env.APP_PASSPHRASE = originalPassphrase;
  process.env.AUTH_COOKIE_SECRET = originalSecret;
});

describe("auth tokens", () => {
  it("preserves accountVersion so password changes can revoke sessions", async () => {
    process.env.APP_PASSPHRASE = "test-passphrase";
    process.env.AUTH_COOKIE_SECRET = "x".repeat(32);

    const token = await makeAuthToken({
      role: "individual",
      userId: "alice",
      name: "Alice",
      accountVersion: "version-1",
    });
    await expect(verifyAuthToken(token)).resolves.toEqual({
      role: "individual",
      userId: "alice",
      name: "Alice",
      accountVersion: "version-1",
    });
  });

  it("rejects tokens that are missing an accountVersion for non-demo roles", async () => {
    process.env.APP_PASSPHRASE = "test-passphrase";
    process.env.AUTH_COOKIE_SECRET = "x".repeat(32);

    const token = await makeAuthToken({ role: "admin", userId: "admin", name: "Admin" });
    await expect(verifyAuthToken(token)).resolves.toBeNull();
  });
});
