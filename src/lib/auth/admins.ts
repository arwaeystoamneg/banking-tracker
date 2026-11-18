import "server-only";

import { z } from "zod";
import type { CrudRepository } from "@/lib/repositories/types";
import { isConfiguredAccountRole, isOwner, OWNER_ACCOUNT_ID, type AuthUser } from "@/lib/auth/types";

/**
 * Admin status for people's own accounts, stored in the sheet's `Admins` tab. Ray (the owner) is always
 * admin and is the only one who can grant or remove it. Like Accounts, this is not one of the Repositories,
 * so it's never written through the generic data API.
 */

export const adminGrantSchema = z.object({
  admin_id: z.string().trim().min(1),
  name: z.string().default(""),
  granted_by: z.string().default(""),
  granted_at: z.string().default(""),
  _row_version: z.number().int().positive(),
});

export type AdminGrant = z.infer<typeof adminGrantSchema>;
type GrantCreate = Omit<AdminGrant, "admin_id" | "_row_version">;
type GrantPatch = Partial<GrantCreate>;
type AdminsStore = CrudRepository<AdminGrant, GrantCreate, GrantPatch>;

const globalForAdmins = globalThis as unknown as { __adminsStore?: AdminsStore; __adminsTest?: AdminsStore };

export function setAdminsStoreForTests(store: AdminsStore | undefined): void {
  globalForAdmins.__adminsTest = store;
}

async function store(): Promise<AdminsStore> {
  if (globalForAdmins.__adminsTest) return globalForAdmins.__adminsTest;
  if (globalForAdmins.__adminsStore) return globalForAdmins.__adminsStore;
  const noId = () => {
    throw new Error("Admin grants are keyed by account id");
  };
  const { getActiveBackend } = await import("@/lib/repositories");
  if (getActiveBackend() === "sheets") {
    const { createSheetsRepository } = await import("@/lib/repositories/sheets/sheetsRepository");
    const { ADMINS_TAB } = await import("@/lib/repositories/sheets/tabs");
    globalForAdmins.__adminsStore = createSheetsRepository<AdminGrant, GrantCreate, GrantPatch>({
      tab: "Admins",
      tabConfig: ADMINS_TAB,
      makeId: noId,
      rowSchema: adminGrantSchema,
    });
  } else {
    const { createMockRepository } = await import("@/lib/repositories/mock/mockRepository");
    globalForAdmins.__adminsStore = createMockRepository<AdminGrant, GrantCreate, GrantPatch>({
      tab: "Admins",
      table: "admins",
      idField: "admin_id",
      makeId: noId,
      rowSchema: adminGrantSchema,
    });
  }
  return globalForAdmins.__adminsStore;
}

const normalize = (id: string) => id.trim().toLowerCase();

/** Account ids with admin status (Ray not included — he always has it). Shared few-seconds-old read. */
export async function listAdminIds(): Promise<Set<string>> {
  return new Set((await (await store()).list()).map((grant) => normalize(grant.admin_id)));
}

/**
 * Sets `admin` on a signed-in person: always for Ray, and for anyone with a grant. Never for the demo, a
 * pending sign-up, or the shared admin login (which already has every power). If the Admins tab can't be read,
 * nobody but Ray is admin for that request — never the other way round, and never an error that blocks logging.
 */
export async function withAdminStatus(user: AuthUser): Promise<AuthUser> {
  if (!isConfiguredAccountRole(user.role) || user.pending) return user;
  if (isOwner(user)) return { ...user, admin: true };
  try {
    return (await listAdminIds()).has(normalize(user.userId)) ? { ...user, admin: true } : user;
  } catch (error) {
    console.error("Could not read admin grants; treating as not admin", error);
    return user;
  }
}

export async function grantAdmin(id: string, name: string, grantedBy: string): Promise<void> {
  const accountId = normalize(id);
  if (accountId === OWNER_ACCOUNT_ID) return;
  const repo = await store();
  if (await repo.get(accountId)) return;
  await repo.create({ name, granted_by: grantedBy, granted_at: new Date().toISOString() }, accountId);
}

export async function revokeAdmin(id: string): Promise<void> {
  const repo = await store();
  const grant = await repo.get(normalize(id));
  if (grant) await repo.remove(grant.admin_id, grant._row_version);
}
