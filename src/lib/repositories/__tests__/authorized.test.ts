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
  type LoanEntry,
  type LossEvidence,
  type LossReport,
  type Paytable,
  type PayrollMember,
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
  payrollMembers?: PayrollMember[];
  loans?: LoanEntry[];
}): Repositories & {
  games: ReturnType<typeof memoryRepo<Game>>;
  sidebets: ReturnType<typeof memoryRepo<Sidebet>>;
  paytables: ReturnType<typeof memoryRepo<Paytable>>;
  feeSchedules: ReturnType<typeof memoryRepo<FeeSchedule>>;
  sessions: ReturnType<typeof memoryRepo<Session>>;
  rounds: ReturnType<typeof memoryRepo<Round>>;
  reimbursements: ReturnType<typeof memoryRepo<Reimbursement>>;
  payrollMembers: ReturnType<typeof memoryRepo<PayrollMember>>;
  loans: ReturnType<typeof memoryRepo<LoanEntry>>;
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
    payrollMembers: memoryRepo(seed.payrollMembers ?? [], "membership_id"),
    loans: memoryRepo(seed.loans ?? [], "loan_entry_id"),
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

describe("session payroll", () => {
  const damonUser: AuthUser = { role: "employee", userId: "damon", name: "Damon" };
  const team: TeamMember[] = [
    { id: "ray", name: "Ray Tang", role: "individual" },
    { id: "damon", name: "Damon", role: "employee" },
    { id: "sam", name: "Sam Park", role: "individual" },
  ];
  const sam: AuthUser = { role: "individual", userId: "sam", name: "Sam Park" };
  const played = () =>
    sessionSchema.parse({
      session_id: "p1",
      date: "2026-10-10",
      buy_in: 100,
      buy_out: 150,
      time_in: "18:00",
      time_out: "22:00",
      logged_by: "Damon",
      logged_at: "2026-10-10T18:00:00Z",
      owner_id: "damon",
      player: "Damon",
      player_id: "damon",
      _row_version: 1,
    });

  it("lets Ray mark someone else's session paid, stamping who and when", async () => {
    const repos = fixtureRepos({ sessions: [played()] });
    const paid = await createAuthorizedRepositories(repos, ray, team).sessions.update(
      "p1",
      { payroll_paid_at: "x", payroll_paid_by: "spoofed" },
      1,
    );
    expect(paid.payroll_paid_by).toBe("Ray Tang");
    expect(paid.payroll_paid_at).not.toBe("x");
  });

  it("refuses everyone else, including the employee and other partners", async () => {
    for (const user of [damonUser, sam]) {
      const repos = fixtureRepos({ sessions: [played()] });
      await expect(
        createAuthorizedRepositories(repos, user, team).sessions.update("p1", { payroll_paid_at: "x" }, 1),
      ).rejects.toThrow("Only Ray or an admin");
    }
  });

  it("locks a paid session against the employee's edits", async () => {
    const repos = fixtureRepos({ sessions: [{ ...played(), payroll_paid_at: "2026-10-12", payroll_paid_by: "Ray Tang" }] });
    await expect(
      createAuthorizedRepositories(repos, damonUser, team).sessions.update("p1", { time_out: "23:59" }, 1),
    ).rejects.toThrow("has been paid");
  });

  it("won't pay someone who isn't on payroll", async () => {
    const repos = fixtureRepos({ sessions: [{ ...played(), player: "Sam Park", player_id: "sam" }] });
    await expect(
      createAuthorizedRepositories(repos, ray, team).sessions.update("p1", { payroll_paid_at: "x" }, 1),
    ).rejects.toThrow("isn't on payroll");
  });

  it("won't pay a session that is still open", async () => {
    const repos = fixtureRepos({ sessions: [{ ...played(), buy_out: null, time_out: "" }] });
    await expect(
      createAuthorizedRepositories(repos, admin, team).sessions.update("p1", { payroll_paid_at: "x" }, 1),
    ).rejects.toThrow("End the session");
  });
});

describe("payroll members", () => {
  const sam: AuthUser = { role: "individual", userId: "sam", name: "Sam Park" };
  const roster: TeamMember[] = [...team, { id: "sam", name: "Sam Park", role: "individual" }];
  const add = { member_id: "sam", member_name: "", added_by: "", added_at: "", hourly_rate: null, overtime_rate: null, double_time_rate: null };

  it("lets Ray add an individual, once", async () => {
    const repos = fixtureRepos({});
    const authorized = createAuthorizedRepositories(repos, ray, roster);
    const row = await authorized.payrollMembers.create({ ...add, member_id: "SAM" }, "pm1");
    expect(row).toMatchObject({ member_id: "sam", member_name: "Sam Park", added_by: "Ray Tang" });
    await authorized.payrollMembers.create(add, "pm2");
    expect(await repos.payrollMembers.list()).toHaveLength(1);
  });

  it("refuses anyone but Ray or admin, and people without an account", async () => {
    const repos = fixtureRepos({});
    await expect(createAuthorizedRepositories(repos, sam, roster).payrollMembers.create(add, "pm1")).rejects.toThrow(
      "Only Ray or an admin",
    );
    await expect(
      createAuthorizedRepositories(repos, admin, roster).payrollMembers.create({ ...add, member_id: "stranger" }, "pm1"),
    ).rejects.toThrow("account");
  });

  it("only Ray or admin can take someone off", async () => {
    const repos = fixtureRepos({
      payrollMembers: [{ membership_id: "pm1", member_id: "sam", member_name: "Sam Park", added_by: "Ray Tang", added_at: "", hourly_rate: null, overtime_rate: null, double_time_rate: null, _row_version: 1 }],
    });
    await expect(createAuthorizedRepositories(repos, sam, roster).payrollMembers.remove("pm1", 1)).rejects.toThrow(
      "Only Ray or an admin",
    );
    await createAuthorizedRepositories(repos, admin, roster).payrollMembers.remove("pm1", 1);
    expect(repos.payrollMembers.removed).toEqual(["pm1"]);
  });
});

describe("session start dates", () => {
  // 1:32am Pacific on Oct 23.
  const clock = () => new Date("2026-10-23T08:32:00Z");
  const base = { buy_in: 100, time_in: "19:30", logged_by: "Ray Tang", logged_at: "", casino: "" };

  it("fixes a session saved after midnight with the next day's date", async () => {
    const repos = fixtureRepos({});
    const created = await createAuthorizedRepositories(repos, ray, team, clock).sessions.create(
      { ...base, date: "2026-10-23" },
      "s1",
    );
    expect(created.date).toBe("2026-10-22");
  });

  it("fixes it on edit too, but leaves other edits alone", async () => {
    const repos = fixtureRepos({});
    const authorized = createAuthorizedRepositories(repos, ray, team, clock);
    await authorized.sessions.create({ ...base, date: "2026-10-22", time_in: "00:10" }, "s1");
    const edited = await authorized.sessions.update("s1", { time_in: "20:00", date: "2026-10-23" }, 1);
    expect(edited.date).toBe("2026-10-22");
    const untouched = await authorized.sessions.update("s1", { buy_in: 250 }, 2);
    expect(untouched.date).toBe("2026-10-22");
  });
});

describe("loans", () => {
  const sam: AuthUser = { role: "individual", userId: "sam", name: "Sam Park" };
  const roster: TeamMember[] = [...team, { id: "sam", name: "Sam Park" }];
  const loan = { date: "2026-10-26", kind: "loan" as const, amount: 20000, recorded_by: "x" };

  it("records a loan between two people, linking known names to accounts", async () => {
    const repos = fixtureRepos({});
    const row = await createAuthorizedRepositories(repos, ray, roster).loans.create(
      { ...loan, from_name: "Shiva", to_name: "dana reyes" },
      "ln1",
    );
    expect(row).toMatchObject({ from_name: "Shiva", from_id: "", to_name: "Dana Reyes", to_id: "dana", recorded_by: "Ray Tang", owner_id: "ray" });
  });

  it("refuses a loan to yourself and anyone without an account", async () => {
    const repos = fixtureRepos({});
    await expect(
      createAuthorizedRepositories(repos, ray, roster).loans.create({ ...loan, from_id: "ray", to_name: "ray tang" }, "ln1"),
    ).rejects.toThrow("two different people");
  });

  it("lets the recorder, either side, or admin edit; not other teammates", async () => {
    const repos = fixtureRepos({});
    await createAuthorizedRepositories(repos, ray, roster).loans.create({ ...loan, from_name: "Shiva", to_id: "dana" }, "ln1");
    const asBorrower = await createAuthorizedRepositories(repos, dana, roster).loans.update("ln1", { amount: 19000 }, 1);
    expect(asBorrower.amount).toBe(19000);
    await expect(createAuthorizedRepositories(repos, sam, roster).loans.update("ln1", { amount: 1 }, 2)).rejects.toThrow(
      "Only whoever recorded this",
    );
    await expect(createAuthorizedRepositories(repos, sam, roster).loans.remove("ln1", 2)).rejects.toThrow("delete");
    await createAuthorizedRepositories(repos, admin, roster).loans.remove("ln1", 2);
    expect(repos.loans.removed).toEqual(["ln1"]);
  });
});

describe("pay rates", () => {
  const sam: AuthUser = { role: "individual", userId: "sam", name: "Sam Park" };
  const roster: TeamMember[] = [...team, { id: "damon", name: "Damon", role: "employee" }];
  const row = { membership_id: "pm1", member_id: "damon", member_name: "Damon", added_by: "", added_at: "", hourly_rate: null, overtime_rate: null, double_time_rate: null, _row_version: 1 };

  it("Ray sets rates; only the rate fields change", async () => {
    const repos = fixtureRepos({ payrollMembers: [row] });
    const updated = await createAuthorizedRepositories(repos, ray, roster).payrollMembers.update(
      "pm1",
      { hourly_rate: 60, overtime_rate: 90, member_id: "sam" } as never,
      1,
    );
    expect(updated).toMatchObject({ member_id: "damon", hourly_rate: 60, overtime_rate: 90, double_time_rate: null });
  });

  it("nobody else can change them", async () => {
    const repos = fixtureRepos({ payrollMembers: [row] });
    for (const user of [sam, dana]) {
      await expect(createAuthorizedRepositories(repos, user, roster).payrollMembers.update("pm1", { hourly_rate: 999 }, 1)).rejects.toThrow(
        "Only Ray or an admin",
      );
    }
  });
});
