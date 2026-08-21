import "server-only";

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  AuthConfigError,
  CONFIGURED_ACCOUNT_ROLES,
  isConfiguredAccountRole,
  type AuthUser,
} from "@/lib/auth/types";
import { checkSecret, makeCredentialVersion } from "@/lib/auth/passphrase";

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
