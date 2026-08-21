import { describe, expect, it } from "vitest";
import { createAuthorizedRepositories } from "@/lib/repositories/authorized";
import { toAppendOnly, toLossReportRepository } from "@/lib/repositories/appendOnly";
import { ConflictError, type CrudRepository, type Repositories } from "@/lib/repositories/types";
import {
  lossReportSchema,
  type AuditEntry,
  type FeeSchedule,
  type Game,
  type LossEvidence,
  type LossReport,
  type Paytable,
  type Round,
  type Session,
  type Sidebet,
} from "@/lib/validation/schemas";
import { AuthorizationError } from "@/lib/auth/session";
import type { AuthUser } from "@/lib/auth/types";

const dana: AuthUser = { role: "employee", userId: "dana", name: "Dana Reyes" };
const admin: AuthUser = { role: "admin", userId: "admin", name: "Admin" };

function memoryRepo<T extends { _row_version: number }>(
  rows: T[],
  idField: keyof T & string,
): CrudRepository<T, Partial<T>, Partial<T>> {
  return {
    async list() {
      return [...rows];
    },
    async get(id) {
      return rows.find((row) => String(row[idField]) === id) ?? null;
    },
    async create(data, id) {
      const row = { ...data, [idField]: id, _row_version: 1 } as T;
      rows.push(row);
      return row;
    },
    async update(id, patch, expectedVersion) {
      const index = rows.findIndex((row) => String(row[idField]) === id);
      const existing = rows[index];
      if (!existing) throw new Error(`missing ${id}`);
      if (existing._row_version !== expectedVersion) throw new ConflictError("tab", id, existing);
      const updated = { ...existing, ...patch, _row_version: existing._row_version + 1 };
      rows[index] = updated;
      return updated;
    },
    async remove() {
      throw new Error("not used");
    },
  };
}

function fixtureRepos(seed: { lossReports?: LossReport[]; lossEvidence?: LossEvidence[]; auditLog?: AuditEntry[] }): Repositories {
  return {
    games: memoryRepo<Game>([], "game_id"),
    sidebets: memoryRepo<Sidebet>([], "sidebet_id"),
    paytables: memoryRepo<Paytable>([], "paytable_id"),
    feeSchedules: memoryRepo<FeeSchedule>([], "schedule_id"),
    sessions: memoryRepo<Session>([], "session_id"),
    rounds: memoryRepo<Round>([], "round_id"),
    lossReports: toLossReportRepository(memoryRepo(seed.lossReports ?? [], "loss_id")),
    lossEvidence: toAppendOnly(memoryRepo(seed.lossEvidence ?? [], "evidence_id")),
    auditLog: toAppendOnly(memoryRepo(seed.auditLog ?? [], "entry_id")),
  };
}

const submitted = lossReportSchema.parse({
  loss_id: "lr1",
  casino: "Hollywood Park",
  occurred_at: "2026-08-21T20:00:00.000Z",
  reported_at: "2026-08-21T20:05:00.000Z",
  amount: 2000,
  circumstances: "Tray walked",
  status: "submitted",
  submitted_by: "Dana Reyes",
  owner_id: "dana",
  _row_version: 1,
});

describe("loss report decisions", () => {
  it("stamps the reviewer and writes an audit row in the same call", async () => {
    const inner = fixtureRepos({ lossReports: [{ ...submitted }] });
    const repos = createAuthorizedRepositories(inner, admin);
    const updated = await repos.lossReports.recordDecision(
      "lr1",
      { status: "in_review", review_note: "looking", second_attestor: "", reviewed_by: "", reviewed_at: "" },
      1,
    );
    expect(updated.status).toBe("in_review");
    expect(updated.reviewed_by).toBe("Admin");
    expect(updated.reviewed_at).toBeTruthy();
    const log = await inner.auditLog.list();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ from_status: "submitted", to_status: "in_review", actor: "Admin" });
  });

  it("lets an admin verify any amount without a second attestor", async () => {
    const inner = fixtureRepos({ lossReports: [{ ...submitted }] });
    const repos = createAuthorizedRepositories(inner, admin);
    await expect(
      repos.lossReports.recordDecision(
        "lr1",
        { status: "verified", review_note: "cleared", second_attestor: "", reviewed_by: "", reviewed_at: "" },
        1,
      ),
    ).resolves.toMatchObject({ status: "verified", reviewed_by: "Admin" });
  });

  it("does not let an employee decide a report", async () => {
    const inner = fixtureRepos({ lossReports: [{ ...submitted }] });
    const repos = createAuthorizedRepositories(inner, dana);
    await expect(
      repos.lossReports.recordDecision(
        "lr1",
        { status: "verified", review_note: "", second_attestor: "Ray", reviewed_by: "", reviewed_at: "" },
        1,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("lets an employee read games and see every loss report", async () => {
    const other = lossReportSchema.parse({
      ...submitted,
      loss_id: "lr2",
      owner_id: "ray",
      submitted_by: "Ray Tang",
    });
    const inner = fixtureRepos({ lossReports: [{ ...submitted }, other] });
    const repos = createAuthorizedRepositories(inner, dana);
    const listed = await repos.lossReports.list();
    expect(listed.map((row) => row.loss_id).sort()).toEqual(["lr1", "lr2"]);
    await expect(repos.games.list()).resolves.toEqual([]);
  });
});
