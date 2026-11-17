import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authenticateLogin, registerAndLogin } from "@/lib/auth/authenticate";
import { currentRegisteredUser, listTeamMembers } from "@/lib/auth/accounts";
import { verifyAuthToken } from "@/lib/auth/passphrase";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { canApproveAccounts } from "@/lib/auth/permissions";
import {
  decideRegisteredAccount,
  findRegisteredAccount,
  setAccountsStoreForTests,
  type RegisteredAccount,
} from "@/lib/auth/registered";
import { LOGIN_ERROR } from "@/lib/auth/loginErrors";
import { ConflictError, type CrudRepository } from "@/lib/repositories/types";

type Store = CrudRepository<RegisteredAccount, Omit<RegisteredAccount, "account_id" | "_row_version">, Partial<RegisteredAccount>>;

function memoryStore(): Store {
  const rows: RegisteredAccount[] = [];
  return {
    async list() {
      return rows.map((row) => ({ ...row }));
    },
    async get(id) {
      const row = rows.find((candidate) => candidate.account_id === id);
      return row ? { ...row } : null;
    },
    async create(data, id) {
      const existing = rows.find((candidate) => candidate.account_id === id);
      if (existing) return { ...existing };
      const row = { ...data, account_id: id!, _row_version: 1 } as RegisteredAccount;
      rows.push(row);
      return { ...row };
    },
    async update(id, patch, expectedVersion) {
      const row = rows.find((candidate) => candidate.account_id === id)!;
      if (row._row_version !== expectedVersion) throw new ConflictError("Accounts", id, row);
      Object.assign(row, patch, { _row_version: row._row_version + 1 });
      return { ...row };
    },
    async remove() {},
  };
}

const saved = { ...process.env };
let attempt = 0;
const key = () => `test-${++attempt}`;

beforeEach(() => {
  process.env.APP_PASSPHRASE = "admin-pass";
  process.env.AUTH_COOKIE_SECRET = "x".repeat(40);
  process.env.APP_USERS_JSON = JSON.stringify([
    { id: "ray", name: "Ray Tang", password: "ray-pass" },
    { id: "damon", name: "Damon", password: "damon-pass", role: "employee" },
  ]);
  setAccountsStoreForTests(memoryStore());
});

afterEach(() => {
  process.env = { ...saved };
  setAccountsStoreForTests(undefined);
});

async function register(username: string, name: string, password = "long-password") {
  return registerAndLogin({ username, name, password, confirm: password, attemptKey: key() });
}

describe("passwords", () => {
  it("hashes with a salt and verifies only the right password", async () => {
    const first = await hashPassword("hunter2hunter2");
    const second = await hashPassword("hunter2hunter2");
    expect(first).not.toBe(second);
    expect(first).not.toContain("hunter2");
    expect(await verifyPassword("hunter2hunter2", first)).toBe(true);
    expect(await verifyPassword("wrong-password", first)).toBe(false);
    expect(await verifyPassword("hunter2hunter2", "garbage")).toBe(false);
  });
});

describe("self-registration", () => {
  it("creates a pending account that signs in to the demo only", async () => {
    const result = await register("Alex_1", "Alex Kim");
    if ("error" in result) throw new Error(result.error);
    expect(result.user).toMatchObject({ role: "demo", pending: true, name: "Alex Kim" });

    const stored = await findRegisteredAccount("alex_1");
    expect(stored?.status).toBe("pending");
    expect(stored?.password_hash).not.toContain("long-password");

    // The cookie carries the real id; the app sees a separate pending principal.
    const token = await verifyAuthToken(result.token);
    expect(token).toMatchObject({ userId: "alex_1", registered: true, role: "demo" });
    expect(await currentRegisteredUser(token!)).toMatchObject({ role: "demo", userId: "pending_alex_1", pending: true });

    const login = await authenticateLogin({ mode: "account", username: "ALEX_1", passphrase: "long-password", attemptKey: key() });
    expect("user" in login && login.user.role).toBe("demo");
  });

  it("refuses taken, reserved, and malformed sign-ups", async () => {
    await register("alex", "Alex Kim");
    expect(await register("alex", "Someone Else")).toEqual({ error: LOGIN_ERROR.taken });
    expect(await register("alex2", "alex kim")).toEqual({ error: LOGIN_ERROR.taken });
    expect(await register("ray", "Not Ray")).toEqual({ error: LOGIN_ERROR.taken });
    expect(await register("notray", "Ray")).toEqual({ error: LOGIN_ERROR.taken });
    expect(await register("fake", "Ray Tang")).toEqual({ error: LOGIN_ERROR.taken });
    expect(await register("damon", "D")).toEqual({ error: LOGIN_ERROR.taken });
    expect(await register("admin", "Boss")).toEqual({ error: LOGIN_ERROR.taken });
    expect(await register("ab", "Short")).toEqual({ error: LOGIN_ERROR.invalidSignup });
    expect(await register("has space", "Space")).toEqual({ error: LOGIN_ERROR.invalidSignup });
    expect(await register("shortpw", "Short Pw", "1234567")).toEqual({ error: LOGIN_ERROR.invalidSignup });
    expect(
      await registerAndLogin({ username: "mm", name: "M", password: "aaaaaaaa", confirm: "bbbbbbbb", attemptKey: key() }),
    ).toEqual({ error: LOGIN_ERROR.mismatch });
  });

  it("approval takes effect on the existing cookie, and approved people join the team", async () => {
    const result = await register("jopark", "Jo Park");
    if ("error" in result) throw new Error(result.error);
    const token = (await verifyAuthToken(result.token))!;

    await decideRegisteredAccount("jopark", { status: "approved", role: "employee" }, "Ray Tang");
    expect(await currentRegisteredUser(token)).toMatchObject({ role: "employee", userId: "jopark", name: "Jo Park" });
    expect((await listTeamMembers()).map((member) => member.id)).toEqual(["ray", "damon", "jopark"]);

    const login = await authenticateLogin({ mode: "account", username: "jopark", passphrase: "long-password", attemptKey: key() });
    expect("user" in login && login.user).toMatchObject({ role: "employee", userId: "jopark" });
  });

  it("declining signs them out and blocks sign-in", async () => {
    const result = await register("sam", "Sam Lee");
    if ("error" in result) throw new Error(result.error);
    const token = (await verifyAuthToken(result.token))!;

    await decideRegisteredAccount("sam", { status: "declined" }, "Admin");
    expect(await currentRegisteredUser(token)).toBeNull();
    expect(await authenticateLogin({ mode: "account", username: "sam", passphrase: "long-password", attemptKey: key() })).toEqual({
      error: LOGIN_ERROR.declined,
    });
    expect(await authenticateLogin({ mode: "account", username: "sam", passphrase: "wrong-pass", attemptKey: key() })).toEqual({
      error: LOGIN_ERROR.credentials,
    });
  });

  it("never lets the existing Vercel accounts break", async () => {
    await register("alex", "Alex Kim");
    const damon = await authenticateLogin({ mode: "account", username: "damon", passphrase: "damon-pass", attemptKey: key() });
    expect("user" in damon && damon.user).toMatchObject({ role: "employee", userId: "damon" });
    expect("user" in damon && damon.user.registered).toBeFalsy();
  });

  it("rate-limits sign-ups from one address", async () => {
    const attemptKey = "same-address:register";
    for (let index = 0; index < 8; index += 1) {
      await registerAndLogin({ username: `user${index}`, name: `User ${index}`, password: "long-password", confirm: "long-password", attemptKey });
    }
    expect(
      await registerAndLogin({ username: "user9", name: "User 9", password: "long-password", confirm: "long-password", attemptKey }),
    ).toEqual({ error: LOGIN_ERROR.rateLimit });
  });
});

describe("canApproveAccounts", () => {
  it("is Ray (the configured account) and admin only", () => {
    expect(canApproveAccounts({ role: "admin", userId: "admin", name: "Admin" })).toBe(true);
    expect(canApproveAccounts({ role: "individual", userId: "ray", name: "Ray Tang" })).toBe(true);
    expect(canApproveAccounts({ role: "individual", userId: "ray", name: "Ray Tang", registered: true })).toBe(false);
    expect(canApproveAccounts({ role: "employee", userId: "damon", name: "Damon" })).toBe(false);
    expect(canApproveAccounts({ role: "individual", userId: "jopark", name: "Jo Park" })).toBe(false);
  });
});
