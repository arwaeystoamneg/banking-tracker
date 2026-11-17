import "server-only";

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  AuthConfigError,
  CONFIGURED_ACCOUNT_ROLES,
  isConfiguredAccountRole,
  type AuthUser,
  type TeamMember,
} from "@/lib/auth/types";
import { checkSecret, makeCredentialVersion } from "@/lib/auth/passphrase";
import { verifyPassword } from "@/lib/auth/password";
import { findRegisteredAccount, listRegisteredAccounts, type RegisteredAccount } from "@/lib/auth/registered";

const accountSchema = z.object({
  id: z.string().trim().min(1).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(1),
  password: z.string().min(1),
  /** Entries written before loss reporting existed have no role and stay `individual`. */
  role: z.enum(CONFIGURED_ACCOUNT_ROLES).default("individual"),
});

const accountsSchema = z.array(accountSchema);

type Account = z.infer<typeof accountSchema>;

function unwrapEnvJson(raw: string): string {
  let text = raw.trim();
  if (
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith("`") && text.endsWith("`"))
  ) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

export function parseAccountsJson(raw: string): Account[] {
  const text = unwrapEnvJson(raw);
  if (!text) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
    if (typeof parsed === "string") parsed = JSON.parse(parsed);
  } catch {
    throw new AuthConfigError("APP_USERS_JSON is not valid JSON");
  }

  const result = accountsSchema.safeParse(parsed);
  if (!result.success) {
    throw new AuthConfigError("APP_USERS_JSON does not match the expected account list");
  }

  const ids = new Set<string>();
  const names = new Set<string>();
  for (const account of result.data) {
    const normalizedId = account.id.toLowerCase();
    if (ids.has(normalizedId)) {
      throw new AuthConfigError(`APP_USERS_JSON contains duplicate account id: ${account.id}`);
    }
    ids.add(normalizedId);
    const normalizedName = account.name.toLowerCase();
    if (names.has(normalizedName)) {
      throw new AuthConfigError(`APP_USERS_JSON contains duplicate account name: ${account.name}`);
    }
    names.add(normalizedName);
  }
  return result.data;
}

function readAccountsFile(file: string): Account[] {
  const resolved = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  let raw: string;
  try {
    raw = fs.readFileSync(resolved, "utf8");
  } catch {
    throw new AuthConfigError(`APP_USERS_FILE could not be read: ${file}`);
  }
  return parseAccountsJson(raw);
}

function configuredAccounts(): Account[] {
  const raw = process.env.APP_USERS_JSON;
  if (raw?.trim()) return parseAccountsJson(raw);
  const file = process.env.APP_USERS_FILE?.trim();
  if (file) return readAccountsFile(file);
  return [];
}

/** Names and ids of every APP_USERS_JSON account — never passwords. */
export function listConfiguredTeamMembers(): TeamMember[] {
  try {
    return configuredAccounts().map((account) => ({ id: account.id.toLowerCase(), name: account.name, role: account.role }));
  } catch (error) {
    if (error instanceof AuthConfigError) return [];
    throw error;
  }
}

/**
 * Everyone who can be picked as a session's player: APP_USERS_JSON accounts plus approved sign-ups.
 * A failed Accounts read only drops the sign-ups for that request; it never breaks a page or a save.
 */
export async function listTeamMembers(): Promise<TeamMember[]> {
  const configured = listConfiguredTeamMembers();
  let registered: RegisteredAccount[] = [];
  try {
    registered = await listRegisteredAccounts();
  } catch (error) {
    console.error("Could not read registered accounts", error);
  }
  const ids = new Set(configured.map((member) => member.id));
  const approved = registered
    .filter((account) => account.status === "approved" && !ids.has(account.account_id))
    .map((account) => ({ id: account.account_id, name: account.name, role: account.role }));
  return [...configured, ...approved];
}

/**
 * Ids and names a new sign-up may not take: every configured account, admin, demo, and Ray. Lowercased.
 * Names count because permissions match people by id or name.
 */
export function reservedIdentities(): Set<string> {
  const reserved = new Set(["admin", "demo", "ray", "pending"]);
  for (const account of configuredAccounts()) {
    reserved.add(account.id.toLowerCase());
    reserved.add(account.name.trim().toLowerCase());
  }
  return reserved;
}

/** A pending account browses the demo under its own offline database, separate from the one it gets once approved. */
function registeredUser(account: RegisteredAccount, accountVersion: string): AuthUser {
  if (account.status === "approved") {
    return { role: account.role, userId: account.account_id, name: account.name, accountVersion, registered: true };
  }
  return {
    role: "demo",
    userId: `pending_${account.account_id}`,
    name: account.name,
    accountVersion,
    registered: true,
    pending: true,
  };
}

export async function authenticateRegisteredAccount(
  username: string,
  password: string,
): Promise<AuthUser | "declined" | null> {
  const account = await findRegisteredAccount(username, true);
  if (!account || !(await verifyPassword(password, account.password_hash))) return null;
  if (account.status === "declined") return "declined";
  return registeredUser(account, await makeCredentialVersion(account.password_hash));
}

/** The signed cookie of a registered account, for its token (not the user the app sees). */
export function registeredTokenUser(user: AuthUser): AuthUser {
  if (!user.pending) return user;
  return { ...user, userId: user.userId.replace(/^pending_/, "") };
}

/**
 * Re-reads a registered account's row on every request (from the shared few-seconds-old sheet read), so
 * an approval shows up on the next page load and declining someone in the sheet signs them out.
 * If the sheet can't be read, the cookie's own role stands rather than signing everyone out.
 */
export async function currentRegisteredUser(token: AuthUser): Promise<AuthUser | null> {
  if (!token.registered || !token.accountVersion) return null;
  let account: RegisteredAccount | null;
  try {
    account = await findRegisteredAccount(token.userId);
  } catch (error) {
    console.error("Could not read registered accounts; trusting the sign-in cookie", error);
    return token.role === "demo"
      ? { role: "demo", userId: `pending_${token.userId}`, name: token.name, registered: true, pending: true }
      : { role: token.role, userId: token.userId, name: token.name, registered: true };
  }
  if (!account || account.status === "declined") return null;
  if (!(await checkSecret(token.accountVersion, await makeCredentialVersion(account.password_hash)))) return null;
  const { accountVersion: _omit, ...user } = registeredUser(account, token.accountVersion);
  void _omit;
  return user;
}

export async function authenticateAccount(username: string, password: string): Promise<AuthUser | null> {
  const account = configuredAccounts().find(
    (candidate) => candidate.id.toLowerCase() === username.trim().toLowerCase(),
  );
  if (!account || !(await checkSecret(password, account.password))) return null;

  return {
    role: account.role,
    userId: account.id.toLowerCase(),
    name: account.name,
    accountVersion: await makeCredentialVersion(account.password),
  };
}

/**
 * Re-checks a cookie against the current env config on every request. A role change in
 * APP_USERS_JSON therefore takes effect on the next request rather than at the next login.
 */
export async function isCurrentAccountSession(user: AuthUser): Promise<boolean> {
  if (!isConfiguredAccountRole(user.role) || !user.accountVersion) return false;
  const account = configuredAccounts().find((candidate) => candidate.id.toLowerCase() === user.userId);
  return Boolean(
    account &&
      account.name === user.name &&
      account.role === user.role &&
      (await checkSecret(user.accountVersion, await makeCredentialVersion(account.password))),
  );
}
