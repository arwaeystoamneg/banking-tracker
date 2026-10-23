import { describe, expect, it } from "vitest";
import { createAuthorizedRepositories, resolveSessionPlayer } from "@/lib/repositories/authorized";
import { ConflictError, type CrudRepository, type Repositories } from "@/lib/repositories/types";
import { toAppendOnly, toLossReportRepository } from "@/lib/repositories/appendOnly";
import {
  feeScheduleSchema,
  gameSchema,
  paytableSchema,
  reimbursementSchema,
  sessionSchema,
  sidebetSchema,
  type AuditEntry,
  type FeeSchedule,
  type Game,
  type LossEvidence,
  type LossReport,
  type Paytable,
  type Reimbursement,
  type Round,
  type Session,
  type Sidebet,
} from "@/lib/validation/schemas";
import type { AuthUser, TeamMember } from "@/lib/auth/types";

const ray: AuthUser = { role: "individual", userId: "ray", name: "Ray Tang" };
const admin: AuthUser = { role: "admin", userId: "admin", name: "Admin" };
const dana: AuthUser = { role: "employee", userId: "dana", name: "Dana Reyes" };
const team: TeamMember[] = [
  { id: "ray", name: "Ray Tang" },
  { id: "dana", name: "Dana Reyes" },
];

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
  reimbursements?: Reimbursement[];
}): Repositories & {
  games: ReturnType<typeof memoryRepo<Game>>;
  sidebets: ReturnType<typeof memoryRepo<Sidebet>>;
  paytables: ReturnType<typeof memoryRepo<Paytable>>;
  feeSchedules: ReturnType<typeof memoryRepo<FeeSchedule>>;
  sessions: ReturnType<typeof memoryRepo<Session>>;
  rounds: ReturnType<typeof memoryRepo<Round>>;
  reimbursements: ReturnType<typeof memoryRepo<Reimbursement>>;
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
    reimbursements: memoryRepo(seed.reimbursements ?? [], "reimbursement_id"),
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

  it("lets a teammate log a session for another player, who can then cash it out", async () => {
    const inner = fixtureRepos({});
    const asRay = createAuthorizedRepositories(inner, ray, team);
    const created = await asRay.sessions.create(
      { date: "2026-10-15", casino: "Commerce", buy_in: 2000, time_in: "20:00", logged_by: "x", logged_at: "t", player_id: "dana" },
      "s-for-dana",
    );
    expect(created).toMatchObject({ player: "Dana Reyes", player_id: "dana", logged_by: "Ray Tang", owner_id: "ray" });

    const asDana = createAuthorizedRepositories(inner, dana, team);
    const closed = await asDana.sessions.update("s-for-dana", { buy_out: 2600, time_out: "23:30" }, 1);
    expect(closed).toMatchObject({ buy_out: 2600, time_out: "23:30", casino: "Commerce" });
  });

  it("defaults the player to the account logging it", async () => {
    const inner = fixtureRepos({});
    const repos = createAuthorizedRepositories(inner, dana, team);
    const created = await repos.sessions.create(
      { date: "2026-10-15", casino: "Bike", buy_in: 500, time_in: "12:00", logged_by: "x", logged_at: "t" },
      "s-own",
    );
    expect(created).toMatchObject({ player: "Dana Reyes", player_id: "dana" });
  });

  it("logs a finished cash session in one step, with no rounds", async () => {
    const inner = fixtureRepos({});
    const repos = createAuthorizedRepositories(inner, admin, team);
    const created = await repos.sessions.create(
      {
        date: "2026-10-14",
        casino: "Commerce",
        buy_in: 1000,
        buy_out: 1400,
        time_in: "18:00",
        time_out: "22:00",
        logged_by: "Office",
        logged_at: "t",
        player: "Walk-in Backer",
      },
      "s-done",
    );
    expect(created).toMatchObject({ player: "Walk-in Backer", player_id: "", buy_out: 1400 });
  });

  it("closes an open cash session without rounds, but not one whose rounds lack coverage", async () => {
    const inner = fixtureRepos({
      sessions: [{ ...session, owner_id: "ray" }, { ...session, session_id: "s2", owner_id: "ray" }],
      rounds: [
        { round_id: "r1", session_id: "s2", seq: 1, tta: 100, booked: 100, bonus_action: null, fee_tier: "", fee_paid: 1, result: 5, note: "", _row_version: 1 },
      ],
    });
    const repos = createAuthorizedRepositories(inner, ray, team);
    await expect(repos.sessions.update("s1", { buy_out: 900, time_out: "11:00" }, 1)).resolves.toMatchObject({ buy_out: 900 });
    await expect(repos.sessions.update("s2", { buy_out: 900, time_out: "11:00" }, 1)).rejects.toThrow(/round totals/);
    await expect(
      repos.sessions.update("s2", { buy_out: 900, time_out: "11:00", rounds_banked: 1, coverage_pct: 1, collection_paid: 1 }, 1),
    ).resolves.toMatchObject({ coverage_pct: 1 });
  });

  it("keeps the player from reassigning a session someone else logged", async () => {
    const inner = fixtureRepos({ sessions: [{ ...session, owner_id: "ray", player: "Dana Reyes", player_id: "dana" }] });
    const asDana = createAuthorizedRepositories(inner, dana, team);
    await expect(asDana.sessions.update("s1", { player_id: "ray" }, 1)).rejects.toThrow(/who played/);
    await expect(asDana.sessions.update("s1", { player_id: "dana", notes: "ok" }, 1)).resolves.toMatchObject({ notes: "ok" });
  });
});

describe("resolveSessionPlayer", () => {
  it("rejects an unknown account id and links a typed teammate name", () => {
    expect(() => resolveSessionPlayer({ player_id: "nobody" }, ray, team, "")).toThrow(/Unknown player/);
    expect(resolveSessionPlayer({ player: "dana reyes" }, admin, team, "")).toEqual({ player: "Dana Reyes", player_id: "dana" });
    expect(resolveSessionPlayer({}, admin, team, "Office")).toEqual({ player: "Office", player_id: "" });
  });
});

describe("reimbursements", () => {
  const sam: AuthUser = { role: "individual", userId: "sam", name: "Sam Park" };
  const fullTeam: TeamMember[] = [...team, { id: "sam", name: "Sam Park" }];

  function owed(overrides: Partial<Reimbursement> = {}): Reimbursement {
    return reimbursementSchema.parse({
      reimbursement_id: "rb1",
      date: "2026-10-20",
      payee: "Dana Reyes",
      payee_id: "dana",
      amount: 300,
      reason: "Buy-in from own cash",
      requested_by: "Dana Reyes",
      requested_at: "2026-10-20T20:00:00.000Z",
      owner_id: "dana",
      _row_version: 1,
      ...overrides,
    });
  }

  it("files for yourself by default and always starts owed", async () => {
    const repos = fixtureRepos({});
    const created = await createAuthorizedRepositories(repos, dana, fullTeam).reimbursements.create(
      { date: "2026-10-20", amount: 40, requested_by: "spoofed", reason: "Gas" },
      "rb2",
    );
    expect(created).toMatchObject({ payee: "Dana Reyes", payee_id: "dana", requested_by: "Dana Reyes", owner_id: "dana" });
    expect(reimbursementSchema.parse(created).status).toBe("owed");
  });

  it("lets a teammate file on someone's behalf, linking a typed name to their account", async () => {
    const repos = fixtureRepos({});
    const created = await createAuthorizedRepositories(repos, ray, fullTeam).reimbursements.create(
      { date: "2026-10-20", amount: 40, requested_by: "Ray Tang", payee: "dana reyes" },
      "rb2",
    );
    expect(created).toMatchObject({ payee: "Dana Reyes", payee_id: "dana", requested_by: "Ray Tang" });
  });

  it("ignores paid status sent on create", async () => {
    const repos = fixtureRepos({});
    await createAuthorizedRepositories(repos, dana, fullTeam).reimbursements.create(
      { date: "2026-10-20", amount: 40, requested_by: "Dana Reyes", status: "paid" } as never,
      "rb2",
    );
    expect(reimbursementSchema.parse((await repos.reimbursements.list())[0]).status).toBe("owed");
  });

  it("lets partners and admin mark paid, stamping who and when", async () => {
    const repos = fixtureRepos({ reimbursements: [owed()] });
    const paid = await createAuthorizedRepositories(repos, ray, fullTeam).reimbursements.update(
      "rb1",
      { status: "paid", paid_by: "spoofed" },
      1,
    );
    expect(paid).toMatchObject({ status: "paid", paid_by: "Ray Tang" });
    expect(paid.paid_at).not.toBe("");
    const reopened = await createAuthorizedRepositories(repos, admin, fullTeam).reimbursements.update(
      "rb1",
      { status: "owed" },
      2,
    );
    expect(reopened).toMatchObject({ status: "owed", paid_at: "", paid_by: "" });
  });

  it("does not let an employee mark paid, even their own", async () => {
    const repos = fixtureRepos({ reimbursements: [owed()] });
    await expect(
      createAuthorizedRepositories(repos, dana, fullTeam).reimbursements.update("rb1", { status: "paid" }, 1),
    ).rejects.toThrow("Only a partner or an admin");
  });

  it("lets the filer and the payee edit while owed, but not other teammates", async () => {
    const filedByRay = owed({ requested_by: "Ray Tang", owner_id: "ray" });
    const repos = fixtureRepos({ reimbursements: [filedByRay] });
    const asPayee = await createAuthorizedRepositories(repos, dana, fullTeam).reimbursements.update(
      "rb1",
      { amount: 320 },
      1,
    );
    expect(asPayee.amount).toBe(320);
    await expect(
      createAuthorizedRepositories(repos, sam, fullTeam).reimbursements.update("rb1", { amount: 1 }, 2),
    ).rejects.toThrow("Only whoever filed this");
    // The payee cannot hand the reimbursement to someone else; the filer can.
    await expect(
      createAuthorizedRepositories(repos, dana, fullTeam).reimbursements.update("rb1", { payee_id: "sam" }, 2),
    ).rejects.toThrow("change who is owed");
    const moved = await createAuthorizedRepositories(repos, ray, fullTeam).reimbursements.update(
      "rb1",
      { payee_id: "sam" },
      2,
    );
    expect(moved).toMatchObject({ payee: "Sam Park", payee_id: "sam" });
  });

  it("locks a paid reimbursement against edits and deletes except by admin", async () => {
    const repos = fixtureRepos({ reimbursements: [owed({ status: "paid", paid_by: "Ray Tang" })] });
    await expect(
      createAuthorizedRepositories(repos, dana, fullTeam).reimbursements.update("rb1", { amount: 999 }, 1),
    ).rejects.toThrow("locked");
    await expect(createAuthorizedRepositories(repos, dana, fullTeam).reimbursements.remove("rb1", 1)).rejects.toThrow(
      "delete",
    );
    await createAuthorizedRepositories(repos, admin, fullTeam).reimbursements.remove("rb1", 1);
    expect(repos.reimbursements.removed).toEqual(["rb1"]);
  });

  it("reads a status typed into the sheet by hand", () => {
    expect(owed({ status: " Paid " as never }).status).toBe("paid");
    expect(owed({ status: "" as never }).status).toBe("owed");
  });
});
