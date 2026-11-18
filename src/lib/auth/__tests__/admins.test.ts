import { afterEach, describe, expect, it } from "vitest";
import { grantAdmin, revokeAdmin, setAdminsStoreForTests, withAdminStatus, type AdminGrant } from "@/lib/auth/admins";
import { canApproveAccounts, canManageAdmins, canSettleReimbursements, ownsSession } from "@/lib/auth/permissions";
import { canMarkPayrollPaid, payrollPeople } from "@/lib/payroll";
import { isAdmin, isOwner, type AuthUser } from "@/lib/auth/types";
import type { CrudRepository } from "@/lib/repositories/types";
import type { Session } from "@/lib/validation/schemas";

type Store = CrudRepository<AdminGrant, Omit<AdminGrant, "admin_id" | "_row_version">, Partial<AdminGrant>>;

function memoryStore(): Store {
  const rows: AdminGrant[] = [];
  return {
    async list() {
      return rows.map((row) => ({ ...row }));
    },
    async get(id) {
      return rows.find((row) => row.admin_id === id) ?? null;
    },
    async create(data, id) {
      const row = { ...data, admin_id: id!, _row_version: 1 } as AdminGrant;
      rows.push(row);
      return row;
    },
    async update() {
      throw new Error("unused");
    },
    async remove(id) {
      rows.splice(rows.findIndex((row) => row.admin_id === id), 1);
    },
  };
}

const ray: AuthUser = { role: "individual", userId: "ray", name: "Ray Tang" };
const damon: AuthUser = { role: "employee", userId: "damon", name: "Damon" };
const sharedAdmin: AuthUser = { role: "admin", userId: "admin", name: "Admin" };

afterEach(() => setAdminsStoreForTests(undefined));

describe("admin status", () => {
  it("Ray is always admin and the only one who can manage admins", async () => {
    setAdminsStoreForTests(memoryStore());
    const rayNow = await withAdminStatus(ray);
    expect(rayNow).toMatchObject({ role: "individual", admin: true });
    expect(isOwner(rayNow) && isAdmin(rayNow) && canManageAdmins(rayNow)).toBe(true);
    expect(canManageAdmins(sharedAdmin)).toBe(false);
    // A sign-up can't be Ray even if the id matched somehow.
    expect(isOwner({ ...ray, registered: true })).toBe(false);
  });

  it("a promoted employee keeps their role and identity but gets admin powers", async () => {
    setAdminsStoreForTests(memoryStore());
    expect(await withAdminStatus(damon)).toEqual(damon);

    await grantAdmin("Damon", "Damon", "Ray Tang");
    const promoted = await withAdminStatus(damon);
    expect(promoted).toMatchObject({ role: "employee", userId: "damon", admin: true });
    expect(isAdmin(promoted)).toBe(true);
    expect(canManageAdmins(promoted)).toBe(false);
    expect(canApproveAccounts(promoted)).toBe(true);
    expect(canMarkPayrollPaid(promoted)).toBe(true);
    expect(canSettleReimbursements(promoted)).toBe(true);
    expect(ownsSession(promoted, { owner_id: "ray", logged_by: "Ray", player_id: "ray" } as Session)).toBe(true);
    // Still on payroll: payroll reads team roles, which admin status never changes.
    expect(payrollPeople([{ id: "damon", name: "Damon", role: "employee" }], []).map((person) => person.id)).toEqual(["damon"]);

    await revokeAdmin("damon");
    const demoted = await withAdminStatus(damon);
    expect(isAdmin(demoted)).toBe(false);
    expect(canMarkPayrollPaid(demoted)).toBe(false);
  });

  it("never makes the demo or a pending sign-up admin", async () => {
    setAdminsStoreForTests(memoryStore());
    await grantAdmin("pending_x", "X", "Ray Tang");
    const pending: AuthUser = { role: "demo", userId: "pending_x", name: "X", registered: true, pending: true };
    expect(isAdmin(await withAdminStatus(pending))).toBe(false);
    expect(isAdmin({ ...damon, admin: true, pending: true })).toBe(false);
  });

  it("an unreadable Admins tab means no extra admins, never an error", async () => {
    const broken = memoryStore();
    broken.list = async () => {
      throw new Error("quota");
    };
    setAdminsStoreForTests(broken);
    expect(await withAdminStatus(damon)).toEqual(damon);
    expect((await withAdminStatus(ray)).admin).toBe(true);
  });

  it("granting Ray is a no-op", async () => {
    const store = memoryStore();
    setAdminsStoreForTests(store);
    await grantAdmin("ray", "Ray Tang", "Ray Tang");
    expect(await store.list()).toEqual([]);
  });
});
