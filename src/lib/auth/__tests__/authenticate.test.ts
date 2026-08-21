import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAccountsJson } from "@/lib/auth/accounts";
import { authenticateLogin } from "@/lib/auth/authenticate";
import { AuthConfigError } from "@/lib/auth/types";
import { LOGIN_ERROR, safeLoginDestination } from "@/lib/auth/loginErrors";

const originalPassphrase = process.env.APP_PASSPHRASE;
const originalSecret = process.env.AUTH_COOKIE_SECRET;
const originalUsers = process.env.APP_USERS_JSON;
const originalUsersFile = process.env.APP_USERS_FILE;

afterEach(() => {
  process.env.APP_PASSPHRASE = originalPassphrase;
  process.env.AUTH_COOKIE_SECRET = originalSecret;
  process.env.APP_USERS_JSON = originalUsers;
  process.env.APP_USERS_FILE = originalUsersFile;
});

describe("parseAccountsJson", () => {
  it("accepts pretty-printed JSON with whitespace", () => {
    const pretty = `[
  {"id": "ray", "name": "Ray Tang", "password": "secret", "role": "individual"}
]`;
    expect(parseAccountsJson(pretty)).toEqual([
      { id: "ray", name: "Ray Tang", password: "secret", role: "individual" },
    ]);
  });

  it("accepts dashboard-wrapped and double-encoded JSON from Vercel env vars", () => {
    const accounts = [{ id: "ray", name: "Ray Tang", password: "secret" }];
    const parsed = [{ ...accounts[0], role: "individual" }];
    expect(parseAccountsJson(JSON.stringify(accounts))).toEqual(parsed);
    expect(parseAccountsJson(`'${JSON.stringify(accounts)}'`)).toEqual(parsed);
    expect(parseAccountsJson(JSON.stringify(JSON.stringify(accounts)))).toEqual(parsed);
  });

  it("reads the employee role and defaults entries written before roles existed", () => {
    const accounts = [
      { id: "ray", name: "Ray Tang", password: "secret" },
      { id: "dana", name: "Dana Reyes", password: "other", role: "employee" },
    ];
    expect(parseAccountsJson(JSON.stringify(accounts)).map((account) => account.role)).toEqual([
      "individual",
      "employee",
    ]);
  });

  it("rejects a role that is not a configured account role", () => {
    const accounts = [{ id: "ray", name: "Ray Tang", password: "secret", role: "admin" }];
    expect(() => parseAccountsJson(JSON.stringify(accounts))).toThrow(AuthConfigError);
  });

  it("rejects malformed account lists with AuthConfigError", () => {
    expect(() => parseAccountsJson("{not json")).toThrow(AuthConfigError);
    expect(() => parseAccountsJson(JSON.stringify({ id: "ray" }))).toThrow(AuthConfigError);
  });
});

describe("safeLoginDestination", () => {
  it("blocks open redirects and auth routes", () => {
    expect(safeLoginDestination("/games")).toBe("/games");
    expect(safeLoginDestination("https://evil.example")).toBe("/");
    expect(safeLoginDestination("//evil.example")).toBe("/");
    expect(safeLoginDestination("/login")).toBe("/");
    expect(safeLoginDestination("/api/login")).toBe("/");
  });
});

describe("authenticateLogin", () => {
  it("signs demo access without a password", async () => {
    process.env.APP_PASSPHRASE = "admin-pass";
    process.env.AUTH_COOKIE_SECRET = "s".repeat(32);

    const result = await authenticateLogin({
      mode: "demo",
      username: "",
      passphrase: "",
      attemptKey: "test:demo",
    });
    expect(result).toMatchObject({ user: { role: "demo", userId: "demo" } });
    expect("token" in result && result.token.includes(".")).toBe(true);
  });

  it("returns a config error when APP_USERS_JSON is invalid", async () => {
    process.env.APP_PASSPHRASE = "admin-pass";
    process.env.APP_USERS_JSON = "{not-json";
    process.env.AUTH_COOKIE_SECRET = "s".repeat(32);

    await expect(
      authenticateLogin({
        mode: "account",
        username: "ray",
        passphrase: "ray-pass",
        attemptKey: "test:bad-json",
      }),
    ).resolves.toEqual({ error: LOGIN_ERROR.config });
  });

  it("authenticates configured individual accounts", async () => {
    process.env.APP_PASSPHRASE = "admin-pass";
    process.env.AUTH_COOKIE_SECRET = "s".repeat(32);
    process.env.APP_USERS_JSON = JSON.stringify([{ id: "ray", name: "Ray Tang", password: "ray-pass" }]);

    const result = await authenticateLogin({
      mode: "account",
      username: "Ray",
      passphrase: "ray-pass",
      attemptKey: "test:ray",
    });
    expect(result).toMatchObject({ user: { role: "individual", userId: "ray", name: "Ray Tang" } });
  });

  it("loads accounts from APP_USERS_FILE when APP_USERS_JSON is empty", async () => {
    const dir = mkdtempSync(join(tmpdir(), "app-users-"));
    const file = join(dir, "users.json");
    writeFileSync(
      file,
      JSON.stringify([{ id: "ray", name: "Ray Tang", password: "ray-pass", role: "individual" }], null, 2),
    );
    process.env.APP_PASSPHRASE = "admin-pass";
    process.env.AUTH_COOKIE_SECRET = "s".repeat(32);
    process.env.APP_USERS_JSON = "";
    process.env.APP_USERS_FILE = file;

    const result = await authenticateLogin({
      mode: "account",
      username: "ray",
      passphrase: "ray-pass",
      attemptKey: "test:file",
    });
    expect(result).toMatchObject({ user: { role: "individual", userId: "ray", name: "Ray Tang" } });
  });
});
