import { describe, expect, it } from "vitest";
import { createAuthorizedRepositories } from "@/lib/repositories/authorized";
import { ConflictError, type CrudRepository, type Repositories } from "@/lib/repositories/types";
import { toAppendOnly, toLossReportRepository } from "@/lib/repositories/appendOnly";
import {
  feeScheduleSchema,
  gameSchema,
  paytableSchema,
  sessionSchema,
  sidebetSchema,
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
import type { AuthUser } from "@/lib/auth/types";

const ray: AuthUser = { role: "individual", userId: "ray", name: "Ray Tang" };
const admin: AuthUser = { role: "admin", userId: "admin", name: "Admin" };

function memoryRepo<T extends { _row_version: number }>(
  rows: T[],
  idField: keyof T & string,
): CrudRepository<T, Partial<T>, Partial<T>> & { removed: string[] } {
  const removed: string[] = [];
  return {
    removed,
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
    async remove(id, expectedVersion) {
      const index = rows.findIndex((row) => String(row[idField]) === id);
      if (index === -1) return;
      if (rows[index]._row_version !== expectedVersion) throw new ConflictError("tab", id, rows[index]);
      removed.push(id);
      rows.splice(index, 1);
    },
  };
}

function fixtureRepos(seed: {
  games?: Game[];
  sidebets?: Sidebet[];
  paytables?: Paytable[];
  feeSchedules?: FeeSchedule[];
  sessions?: Session[];
  rounds?: Round[];
  lossReports?: LossReport[];
  lossEvidence?: LossEvidence[];
  auditLog?: AuditEntry[];
}): Repositories & {
  games: ReturnType<typeof memoryRepo<Game>>;
  sidebets: ReturnType<typeof memoryRepo<Sidebet>>;
  paytables: ReturnType<typeof memoryRepo<Paytable>>;
  feeSchedules: ReturnType<typeof memoryRepo<FeeSchedule>>;
  sessions: ReturnType<typeof memoryRepo<Session>>;
  rounds: ReturnType<typeof memoryRepo<Round>>;
} {
  return {
    games: memoryRepo(seed.games ?? [], "game_id"),
    sidebets: memoryRepo(seed.sidebets ?? [], "sidebet_id"),
    paytables: memoryRepo(seed.paytables ?? [], "paytable_id"),
    feeSchedules: memoryRepo(seed.feeSchedules ?? [], "schedule_id"),
    sessions: memoryRepo(seed.sessions ?? [], "session_id"),
    rounds: memoryRepo(seed.rounds ?? [], "round_id"),
    lossReports: toLossReportRepository(memoryRepo(seed.lossReports ?? [], "loss_id")),
    lossEvidence: toAppendOnly(memoryRepo(seed.lossEvidence ?? [], "evidence_id")),
    auditLog: toAppendOnly(memoryRepo(seed.auditLog ?? [], "entry_id")),
  };
}

const game = gameSchema.parse({
  game_id: "g1",
  name: "Test game",
  edge_pct: 0.01,
  exposure_mult: 1,
  edited_by: "Ray Tang",
  owner_id: "",
  _row_version: 2,
});

const sidebet = sidebetSchema.parse({
  sidebet_id: "sb1",
  game_id: "g1",
  name: "Trips",
  edge_pct: 0.1,
  _row_version: 1,
});

const paytable = paytableSchema.parse({
  paytable_id: "pt1",
  sidebet_id: "sb1",
  ordinal: 1,
  outcome: "Trips",
  payout: "9:1",
  _row_version: 1,
});

const schedule = feeScheduleSchema.parse({
  schedule_id: "fs1",
  game_id: "g1",
  basis: "tta",
  tier_min: 0,
  tier_max: null,
  pd_fee: 1,
  _row_version: 1,
});

const session = sessionSchema.parse({
  session_id: "s1",
  date: "2026-08-21",
  casino: "Demo Room",
  buy_in: 1000,
  time_in: "09:00",
  logged_by: "Ray Tang",
  logged_at: "2026-08-21T16:00:00.000Z",
  owner_id: "",
  _row_version: 1,
});

describe("authorized repositories", () => {
  it("does not cascade child deletes when the parent version is stale", async () => {
    const inner = fixtureRepos({ games: [{ ...game }], sidebets: [sidebet], paytables: [paytable], feeSchedules: [schedule] });
    const repos = createAuthorizedRepositories(inner, admin);
    await expect(repos.games.remove("g1", 1)).rejects.toBeInstanceOf(ConflictError);
    expect(inner.paytables.removed).toEqual([]);
    expect(inner.sidebets.removed).toEqual([]);
    expect(inner.feeSchedules.removed).toEqual([]);
    expect(inner.games.removed).toEqual([]);
  });

  it("freezes a legacy game owner so an admin edit cannot steal it via edited_by", async () => {
    const inner = fixtureRepos({ games: [{ ...game }] });
    const repos = createAuthorizedRepositories(inner, admin);
    const updated = await repos.games.update("g1", { notes: "checked" }, 2);
    expect(updated.owner_id).toBe("Ray Tang");
    expect(updated.edited_by).toBe("Admin");
    const asRay = createAuthorizedRepositories(inner, ray);
    await expect(asRay.games.update("g1", { notes: "still mine" }, 3)).resolves.toMatchObject({ notes: "still mine" });
  });

  it("lets an admin change logged_by without dropping the field", async () => {
    const inner = fixtureRepos({ sessions: [session] });
    const repos = createAuthorizedRepositories(inner, admin);
    const updated = await repos.sessions.update("s1", { logged_by: "Other Person", notes: "fix name" }, 1);
    expect(updated.logged_by).toBe("Other Person");
    expect(updated.owner_id).toBe("Ray Tang");
  });

  it("strips logged_by from an individual patch so they cannot impersonate", async () => {
    const inner = fixtureRepos({ sessions: [{ ...session, owner_id: "ray" }] });
    const repos = createAuthorizedRepositories(inner, ray);
    const updated = await repos.sessions.update("s1", { logged_by: "Other Person", notes: "hi" }, 1);
    expect(updated.logged_by).toBe("Ray Tang");
    expect(updated.notes).toBe("hi");
  });
});
