import "server-only";

import { z } from "zod";
import type { AuthUser } from "@/lib/auth/types";
import { checkSecret, makeCredentialVersion } from "@/lib/auth/passphrase";

const accountSchema = z.object({
  id: z.string().trim().min(1).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(1),
  password: z.string().min(1),
});

const accountsSchema = z.array(accountSchema);

type Account = z.infer<typeof accountSchema>;

function configuredAccounts(): Account[] {
  const raw = process.env.APP_USERS_JSON;
  if (!raw) return [];

  const accounts = accountsSchema.parse(JSON.parse(raw));
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const account of accounts) {
    const normalizedId = account.id.toLowerCase();
    if (ids.has(normalizedId)) {
      throw new Error(`APP_USERS_JSON contains duplicate account id: ${account.id}`);
    }
    ids.add(normalizedId);
    const normalizedName = account.name.toLowerCase();
    if (names.has(normalizedName)) {
      throw new Error(`APP_USERS_JSON contains duplicate account name: ${account.name}`);
    }
    names.add(normalizedName);
  }
  return accounts;
}

export async function authenticateIndividual(username: string, password: string): Promise<AuthUser | null> {
  const account = configuredAccounts().find(
    (candidate) => candidate.id.toLowerCase() === username.trim().toLowerCase(),
  );
  if (!account || !(await checkSecret(password, account.password))) return null;

  return {
    role: "individual",
    userId: account.id.toLowerCase(),
    name: account.name,
    accountVersion: await makeCredentialVersion(account.password),
  };
}

export async function isCurrentIndividualSession(user: AuthUser): Promise<boolean> {
  if (user.role !== "individual" || !user.accountVersion) return false;
  const account = configuredAccounts().find((candidate) => candidate.id.toLowerCase() === user.userId);
  return Boolean(
    account &&
      account.name === user.name &&
      (await checkSecret(user.accountVersion, await makeCredentialVersion(account.password))),
  );
}
