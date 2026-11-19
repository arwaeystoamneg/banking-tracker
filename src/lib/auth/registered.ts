import "server-only";

import { z } from "zod";
import type { CrudRepository } from "@/lib/repositories/types";
import { hashPassword } from "@/lib/auth/password";
import { CONFIGURED_ACCOUNT_ROLES, type ConfiguredAccountRole } from "@/lib/auth/types";

/**
 * Accounts people create for themselves on the login page, stored in the sheet's `Accounts` tab (or the
 * mock store locally). A new account is `pending`: it can sign in but only sees the public demo until Ray or
 * admin approves it, which makes it a normal individual or employee account. Nobody edits Vercel env vars.
 *
 * This store is deliberately not one of the Repositories: it holds password hashes, so it is never listed,
 * exported, or written through the generic data API.
 */

export const REGISTERED_STATUSES = ["pending", "approved", "declined"] as const;
export type RegisteredStatus = (typeof REGISTERED_STATUSES)[number];

export const registeredAccountSchema = z.object({
  account_id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  password_hash: z.string().min(1),
  status: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
    z.enum(REGISTERED_STATUSES).catch("pending"),
  ),
  role: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
    z.enum(CONFIGURED_ACCOUNT_ROLES).catch("individual"),
  ),
  requested_at: z.string().default(""),
  decided_by: z.string().default(""),
  decided_at: z.string().default(""),
  _row_version: z.number().int().positive(),
});

export type RegisteredAccount = z.infer<typeof registeredAccountSchema>;
type RegisteredCreate = Omit<RegisteredAccount, "account_id" | "_row_version">;
type RegisteredPatch = Partial<RegisteredCreate>;
type AccountsStore = CrudRepository<RegisteredAccount, RegisteredCreate, RegisteredPatch>;

/** What Ray/admin see when deciding: never the hash. */
export interface AccountRequest {
  id: string;
  name: string;
  status: RegisteredStatus;
  role: ConfiguredAccountRole;
  requestedAt: string;
}

export const USERNAME_PATTERN = /^[a-z0-9_-]{3,32}$/;
export const MIN_PASSWORD_LENGTH = 8;
/** Sign-ups waiting for approval at once; more are refused until Ray approves or declines some. */
export const MAX_PENDING_SIGNUPS = 25;

const globalForAccounts = globalThis as unknown as { __accountsStore?: AccountsStore; __accountsTest?: AccountsStore };

/** Tests swap in an in-memory store. */
export function setAccountsStoreForTests(store: AccountsStore | undefined): void {
  globalForAccounts.__accountsTest = store;
}

async function store(): Promise<AccountsStore> {
  if (globalForAccounts.__accountsTest) return globalForAccounts.__accountsTest;
  if (globalForAccounts.__accountsStore) return globalForAccounts.__accountsStore;
  const { getActiveBackend } = await import("@/lib/repositories");
  if (getActiveBackend() === "sheets") {
    const { createSheetsRepository } = await import("@/lib/repositories/sheets/sheetsRepository");
    const { ACCOUNTS_TAB } = await import("@/lib/repositories/sheets/tabs");
    globalForAccounts.__accountsStore = createSheetsRepository<RegisteredAccount, RegisteredCreate, RegisteredPatch>({
      tab: "Accounts",
      tabConfig: ACCOUNTS_TAB,
      makeId: () => {
        throw new Error("Accounts are created with their username as the id");
      },
      rowSchema: registeredAccountSchema,
    });
  } else {
    const { createMockRepository } = await import("@/lib/repositories/mock/mockRepository");
    globalForAccounts.__accountsStore = createMockRepository<RegisteredAccount, RegisteredCreate, RegisteredPatch>({
      tab: "Accounts",
      table: "accounts",
      idField: "account_id",
      makeId: () => {
        throw new Error("Accounts are created with their username as the id");
      },
      rowSchema: registeredAccountSchema,
    });
  }
  return globalForAccounts.__accountsStore;
}

function normalize(id: string): string {
  return id.trim().toLowerCase();
}

/** Shared, possibly a few seconds old (the same batched sheet read the data lists use). */
export async function listRegisteredAccounts(): Promise<RegisteredAccount[]> {
  return (await store()).list();
}

export async function findRegisteredAccount(id: string, fresh = false): Promise<RegisteredAccount | null> {
  const repo = await store();
  if (fresh) return repo.get(normalize(id));
  return (await repo.list()).find((account) => account.account_id === normalize(id)) ?? null;
}

export function toAccountRequest(account: RegisteredAccount): AccountRequest {
  return {
    id: account.account_id,
    name: account.name,
    status: account.status,
    role: account.role,
    requestedAt: account.requested_at,
  };
}

export class RegistrationError extends Error {
  constructor(readonly code: "taken" | "invalid" | "full") {
    super(code);
    this.name = "RegistrationError";
  }
}

/**
 * Creates a pending account. `reserved` is every id and name already in use elsewhere (env accounts,
 * admin, demo) — names matter as much as ids, because permissions match people by either one.
 */
export async function createRegisteredAccount(
  input: { username: string; name: string; password: string },
  reserved: Set<string>,
): Promise<RegisteredAccount> {
  const id = normalize(input.username);
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!USERNAME_PATTERN.test(id) || !name || name.length > 60 || input.password.length < MIN_PASSWORD_LENGTH) {
    throw new RegistrationError("invalid");
  }

  const repo = await store();
  const existing = await repo.listFresh?.() ?? (await repo.list());
  const taken = new Set(reserved);
  for (const account of existing) {
    taken.add(account.account_id);
    // A declined name is free to reuse; a declined username is not, so nobody inherits another's history.
    if (account.status !== "declined") taken.add(normalize(account.name));
  }
  if (taken.has(id) || taken.has(normalize(name))) throw new RegistrationError("taken");
  // A flood of sign-ups would bury real ones in the approval card and grow the sheet; cap what's waiting.
  if (existing.filter((account) => account.status === "pending").length >= MAX_PENDING_SIGNUPS) {
    throw new RegistrationError("full");
  }

  const passwordHash = await hashPassword(input.password);
  const created = await repo.create(
    {
      name,
      password_hash: passwordHash,
      status: "pending",
      role: "individual",
      requested_at: new Date().toISOString(),
      decided_by: "",
      decided_at: "",
    },
    id,
  );
  // create() returns the existing row on an id collision (a race with another sign-up) — never take it over.
  if (created.password_hash !== passwordHash) throw new RegistrationError("taken");
  return created;
}

/** Replaces a stored hash with a stronger one of the same password (see needsRehash). */
export async function upgradePasswordHash(account: RegisteredAccount, passwordHash: string): Promise<RegisteredAccount> {
  const repo = await store();
  return repo.update(account.account_id, { password_hash: passwordHash }, account._row_version);
}

export async function decideRegisteredAccount(
  id: string,
  decision: { status: "approved" | "declined"; role?: ConfiguredAccountRole },
  decidedBy: string,
): Promise<RegisteredAccount | null> {
  const repo = await store();
  const account = await repo.get(normalize(id));
  if (!account) return null;
  return repo.update(
    account.account_id,
    {
      status: decision.status,
      ...(decision.status === "approved" ? { role: decision.role ?? "individual" } : {}),
      decided_by: decidedBy,
      decided_at: new Date().toISOString(),
    },
    account._row_version,
  );
}
