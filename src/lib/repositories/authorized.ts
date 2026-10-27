import "server-only";

import { isConfiguredAccountRole, type AuthUser, type TeamMember } from "@/lib/auth/types";
import {
  canEditLoanEntry,
  canEditReimbursement,
  canRecordLoans,
  canReassignReimbursementPayee,
  canReassignSessionPlayer,
  canRequestReimbursement,
  canSettleReimbursements,
  ownsGame,
  ownsSession,
} from "@/lib/auth/permissions";
import { listTeamMembers } from "@/lib/auth/accounts";
import { AuthorizationError, InputError } from "@/lib/auth/session";
import type { Repositories } from "@/lib/repositories/types";
import { ConflictError, NotFoundError } from "@/lib/repositories/types";
import { createLossRepositories } from "@/lib/repositories/losses";
import type {
  FeeScheduleCreate,
  FeeSchedulePatch,
  GameCreate,
  GamePatch,
  LoanEntryCreate,
  LoanEntryPatch,
  PaytableCreate,
  PaytablePatch,
  PayrollMemberCreate,
  ReimbursementCreate,
  ReimbursementPatch,
  RoundCreate,
  RoundPatch,
  SessionCreate,
  SessionPatch,
  SidebetCreate,
  SidebetPatch,
} from "@/lib/repositories/inferred";
import {
  roundSchema,
  sessionSchema,
  type Game,
  type Reimbursement,
  type Session,
  type Sidebet,
} from "@/lib/validation/schemas";
import { isSessionOpen } from "@/lib/sessionHelpers";
import { canMarkPayrollPaid, payrollPeople, sessionEmployee } from "@/lib/payroll";
import { correctFutureStartDate } from "@/lib/dates";

const PAYROLL_KEYS = ["payroll_paid_at", "payroll_paid_by"];

function assertOwnsGame(user: AuthUser, game: Game): void {
  if (!ownsGame(user, game)) throw new AuthorizationError("Only the game owner or an admin can change this game");
}

function assertOwnsSession(user: AuthUser, session: Session): void {
  if (!ownsSession(user, session)) {
    throw new AuthorizationError("Only the person who logged this session or an admin can change it");
  }
}

async function requiredGame(repos: Repositories, id: string): Promise<Game> {
  const game = await repos.games.get(id);
  if (!game) throw new NotFoundError("Games", id);
  return game;
}

async function requiredSidebet(repos: Repositories, id: string): Promise<Sidebet> {
  const sidebet = await repos.sidebets.get(id);
  if (!sidebet) throw new NotFoundError("Sidebets", id);
  return sidebet;
}

async function requiredReimbursement(repos: Repositories, id: string): Promise<Reimbursement> {
  const item = await repos.reimbursements.get(id);
  if (!item) throw new NotFoundError("Reimbursements", id);
  return item;
}

function samePerson(a: { player: string; player_id: string }, b: { player: string; player_id: string }): boolean {
  if (a.player_id && b.player_id) return a.player_id === b.player_id;
  return a.player.trim().toLowerCase() === b.player.trim().toLowerCase();
}

async function requiredSession(repos: Repositories, id: string): Promise<Session> {
  const session = await repos.sessions.get(id);
  if (!session) throw new NotFoundError("Sessions", id);
  return session;
}

function withoutKeys<T extends object>(value: T, keys: string[]): T {
  const copy = { ...value } as Record<string, unknown>;
  for (const key of keys) delete copy[key];
  return copy as T;
}

function assertVersion(tab: string, id: string, row: { _row_version: number }, expectedVersion: number): void {
  if (row._row_version !== expectedVersion) throw new ConflictError(tab, id, row);
}

/** Stamp owner_id onto a legacy row without letting an admin edit steal it via edited_by/logged_by. */
function claimMissingOwnerId(user: AuthUser, ownerId: string, implicitOwner: string): { owner_id?: string } {
  if (ownerId) return {};
  if (isConfiguredAccountRole(user.role)) return { owner_id: user.userId };
  const frozen = implicitOwner.trim();
  return frozen ? { owner_id: frozen } : {};
}

/**
 * Decides who played. A known account id wins and takes its configured name; a typed name that matches
 * a teammate is linked to their account; anything else is kept as a free-text player outside the team.
 * With nothing given, a configured account is logging its own session and admin falls back to logged_by.
 */
export function resolveSessionPlayer(
  input: { player?: string; player_id?: string },
  user: AuthUser,
  team: TeamMember[],
  fallbackName: string,
): { player: string; player_id: string } {
  const id = input.player_id?.trim().toLowerCase() ?? "";
  if (id) {
    const member =
      team.find((candidate) => candidate.id === id) ??
      (isConfiguredAccountRole(user.role) && id === user.userId ? { id, name: user.name } : undefined);
    if (!member) throw new InputError("Unknown player account");
    return { player: member.name, player_id: member.id };
  }
  const name = input.player?.trim() ?? "";
  if (!name) {
    if (isConfiguredAccountRole(user.role)) return { player: user.name, player_id: user.userId };
    return { player: fallbackName.trim(), player_id: "" };
  }
  const byName = team.find((candidate) => candidate.name.trim().toLowerCase() === name.toLowerCase());
  return byName ? { player: byName.name, player_id: byName.id } : { player: name, player_id: "" };
}

/**
 * Wraps the data layer so every mutation is authorized even if a route handler is later
 * added outside proxy coverage. Reads remain shared for every real account.
 */
export function createAuthorizedRepositories(
  repos: Repositories,
  user: AuthUser,
  team: TeamMember[] = listTeamMembers(),
  now: () => Date = () => new Date(),
): Repositories {
  if (user.role === "demo") throw new AuthorizationError("Demo data must use the isolated demo repository");

  const lossRepositories = createLossRepositories(repos, user);

  return {
    ...lossRepositories,
    games: {
      list: () => repos.games.list(),
      get: (id) => repos.games.get(id),
      create: (data: GameCreate, id?: string) =>
        repos.games.create(
          {
            ...data,
            edited_by: user.name,
            edited_at: new Date().toISOString(),
            owner_id: user.userId,
          },
          id,
        ),
      async update(id: string, patch: GamePatch, expectedVersion: number) {
        const game = await requiredGame(repos, id);
        assertOwnsGame(user, game);
        assertVersion("Games", id, game, expectedVersion);
        const safePatch = withoutKeys(patch, ["owner_id"]);
        return repos.games.update(
          id,
          {
            ...safePatch,
            edited_by: user.name,
            edited_at: new Date().toISOString(),
            ...claimMissingOwnerId(user, game.owner_id, game.edited_by),
          },
          expectedVersion,
        );
      },
      async remove(id: string, expectedVersion: number) {
        const game = await requiredGame(repos, id);
        assertOwnsGame(user, game);
        assertVersion("Games", id, game, expectedVersion);
        const sidebets = (await repos.sidebets.list()).filter((row) => row.game_id === id);
        for (const sidebet of sidebets) {
          const paytables = (await repos.paytables.list()).filter((row) => row.sidebet_id === sidebet.sidebet_id);
          for (const paytable of paytables) {
            await repos.paytables.remove(paytable.paytable_id, paytable._row_version);
          }
          await repos.sidebets.remove(sidebet.sidebet_id, sidebet._row_version);
        }
        const schedules = (await repos.feeSchedules.list()).filter((row) => row.game_id === id);
        for (const schedule of schedules) {
          await repos.feeSchedules.remove(schedule.schedule_id, schedule._row_version);
        }
        return repos.games.remove(id, expectedVersion);
      },
    },
    sidebets: {
      list: () => repos.sidebets.list(),
      get: (id) => repos.sidebets.get(id),
      async create(data: SidebetCreate, id?: string) {
        assertOwnsGame(user, await requiredGame(repos, data.game_id));
        return repos.sidebets.create(data, id);
      },
      async update(id: string, patch: SidebetPatch, expectedVersion: number) {
        const sidebet = await requiredSidebet(repos, id);
        assertOwnsGame(user, await requiredGame(repos, sidebet.game_id));
        assertVersion("Sidebets", id, sidebet, expectedVersion);
        if (patch.game_id && patch.game_id !== sidebet.game_id) {
          if (user.role !== "admin") throw new AuthorizationError("A side bet cannot be moved");
          assertOwnsGame(user, await requiredGame(repos, patch.game_id));
        }
        return repos.sidebets.update(
          id,
          user.role === "admin" ? patch : withoutKeys(patch, ["game_id"]),
          expectedVersion,
        );
      },
      async remove(id: string, expectedVersion: number) {
        const sidebet = await requiredSidebet(repos, id);
        assertOwnsGame(user, await requiredGame(repos, sidebet.game_id));
        assertVersion("Sidebets", id, sidebet, expectedVersion);
        const paytables = (await repos.paytables.list()).filter((row) => row.sidebet_id === id);
        for (const paytable of paytables) {
          await repos.paytables.remove(paytable.paytable_id, paytable._row_version);
        }
        return repos.sidebets.remove(id, expectedVersion);
      },
    },
    paytables: {
      list: () => repos.paytables.list(),
      get: (id) => repos.paytables.get(id),
      async create(data: PaytableCreate, id?: string) {
        const sidebet = await requiredSidebet(repos, data.sidebet_id);
        assertOwnsGame(user, await requiredGame(repos, sidebet.game_id));
        return repos.paytables.create(data, id);
      },
      async update(id: string, patch: PaytablePatch, expectedVersion: number) {
        const row = await repos.paytables.get(id);
        if (!row) throw new NotFoundError("Paytables", id);
        const sidebet = await requiredSidebet(repos, row.sidebet_id);
        assertOwnsGame(user, await requiredGame(repos, sidebet.game_id));
        if (patch.sidebet_id && patch.sidebet_id !== row.sidebet_id) {
          throw new AuthorizationError("A paytable row cannot be moved");
        }
        return repos.paytables.update(id, withoutKeys(patch, ["sidebet_id"]), expectedVersion);
      },
      async remove(id: string, expectedVersion: number) {
        const row = await repos.paytables.get(id);
        if (!row) throw new NotFoundError("Paytables", id);
        const sidebet = await requiredSidebet(repos, row.sidebet_id);
        assertOwnsGame(user, await requiredGame(repos, sidebet.game_id));
        return repos.paytables.remove(id, expectedVersion);
      },
    },
    feeSchedules: {
      list: () => repos.feeSchedules.list(),
      get: (id) => repos.feeSchedules.get(id),
      async create(data: FeeScheduleCreate, id?: string) {
        assertOwnsGame(user, await requiredGame(repos, data.game_id));
        return repos.feeSchedules.create(data, id);
      },
      async update(id: string, patch: FeeSchedulePatch, expectedVersion: number) {
        const row = await repos.feeSchedules.get(id);
        if (!row) throw new NotFoundError("FeeSchedules", id);
        assertOwnsGame(user, await requiredGame(repos, row.game_id));
        if (patch.game_id && patch.game_id !== row.game_id) {
          throw new AuthorizationError("A fee schedule cannot be moved");
        }
        return repos.feeSchedules.update(id, withoutKeys(patch, ["game_id"]), expectedVersion);
      },
      async remove(id: string, expectedVersion: number) {
        const row = await repos.feeSchedules.get(id);
        if (!row) throw new NotFoundError("FeeSchedules", id);
        assertOwnsGame(user, await requiredGame(repos, row.game_id));
        return repos.feeSchedules.remove(id, expectedVersion);
      },
    },
    sessions: {
      list: () => repos.sessions.list(),
      get: (id) => repos.sessions.get(id),
      async create(input: SessionCreate, id?: string) {
        // A new session is never already paid; payroll is checked off afterwards.
        const data = withoutKeys(input, PAYROLL_KEYS);
        const stamped = isConfiguredAccountRole(user.role)
          ? {
              ...data,
              logged_by: user.name,
              logged_at: new Date().toISOString(),
              owner_id: user.userId,
            }
          : { ...data, owner_id: user.userId };
        const withPlayer = {
          ...stamped,
          ...resolveSessionPlayer(data, user, team, stamped.logged_by),
          date: correctFutureStartDate(stamped.date, stamped.time_in, now()),
        };
        const candidate = sessionSchema.parse({ session_id: id ?? "pending", ...withPlayer, _row_version: 1 });
        // A finished cash session (buy-out + time-out) may be logged in one step. Round totals without
        // coverage may not: coverage is what separates a bad game from an underbanked one.
        if (!isSessionOpen(candidate) && candidate.rounds_banked !== null && candidate.coverage_pct === null) {
          throw new InputError("Round totals need coverage data");
        }
        return repos.sessions.create(withPlayer, id);
      },
      async update(id: string, patch: SessionPatch, expectedVersion: number) {
        const session = await requiredSession(repos, id);
        const touchesPayroll = PAYROLL_KEYS.some((key) => key in patch);
        const payrollOnly = touchesPayroll && Object.keys(patch).every((key) => PAYROLL_KEYS.includes(key));
        const approver = canMarkPayrollPaid(user);
        if (touchesPayroll && !approver) {
          throw new AuthorizationError("Only Ray or an admin can mark a session paid");
        }
        // The approver checks off sessions they don't own; any other change still needs ownership.
        if (!payrollOnly) assertOwnsSession(user, session);
        assertVersion("Sessions", id, session, expectedVersion);
        if (!payrollOnly && session.payroll_paid_at && !approver) {
          throw new AuthorizationError("This session has been paid; ask Ray or an admin to change it");
        }
        if (payrollOnly) {
          const paying = Boolean(patch.payroll_paid_at);
          if (paying && isSessionOpen(session)) throw new InputError("End the session before marking it paid");
          const members = await (repos.payrollMembers.listFresh?.() ?? repos.payrollMembers.list());
          if (paying && !sessionEmployee(session, payrollPeople(team, members))) {
            throw new InputError("Whoever played this session isn't on payroll");
          }
          return repos.sessions.update(
            id,
            paying
              ? { payroll_paid_at: new Date().toISOString(), payroll_paid_by: user.name }
              : { payroll_paid_at: "", payroll_paid_by: "" },
            expectedVersion,
          );
        }
        let safePatch: SessionPatch = withoutKeys(patch, [
          ...PAYROLL_KEYS,
          "owner_id",
          "logged_at",
          "player",
          "player_id",
          ...(user.role === "admin" ? [] : ["logged_by"]),
        ]);
        if ("player" in patch || "player_id" in patch) {
          const next = resolveSessionPlayer(
            { player: patch.player ?? "", player_id: patch.player_id ?? "" },
            user,
            team,
            session.logged_by,
          );
          const changed = next.player !== session.player || next.player_id !== session.player_id;
          if (changed && !canReassignSessionPlayer(user, session)) {
            throw new AuthorizationError("Only the person who logged this session or an admin can change who played");
          }
          if (changed) safePatch = { ...safePatch, ...next };
        }
        if ("date" in safePatch || "time_in" in safePatch) {
          const date = safePatch.date ?? session.date;
          const corrected = correctFutureStartDate(date, safePatch.time_in ?? session.time_in, now());
          if (corrected !== date) safePatch = { ...safePatch, date: corrected };
        }
        const candidate = sessionSchema.parse({ ...session, ...safePatch });
        if (isSessionOpen(session) && !isSessionOpen(candidate)) {
          const roundCount = (await repos.rounds.list()).filter((round) => round.session_id === id).length;
          if (roundCount > 0 && candidate.coverage_pct === null) {
            throw new InputError("This session has rounds; cash out from the session page so round totals are saved");
          }
        }
        return repos.sessions.update(
          id,
          {
            ...safePatch,
            ...claimMissingOwnerId(user, session.owner_id, session.logged_by),
          },
          expectedVersion,
        );
      },
      async remove(id: string, expectedVersion: number) {
        const session = await requiredSession(repos, id);
        assertOwnsSession(user, session);
        assertVersion("Sessions", id, session, expectedVersion);
        const rounds = (await repos.rounds.list()).filter((row) => row.session_id === id);
        for (const round of rounds) {
          await repos.rounds.remove(round.round_id, round._row_version);
        }
        return repos.sessions.remove(id, expectedVersion);
      },
    },
    rounds: {
      list: () => repos.rounds.list(),
      get: (id) => repos.rounds.get(id),
      async create(data: RoundCreate, id?: string) {
        const session = await requiredSession(repos, data.session_id);
        assertOwnsSession(user, session);
        if (!isSessionOpen(session)) throw new AuthorizationError("Closed sessions cannot accept round changes");
        const candidate = roundSchema.parse({ round_id: id ?? "pending", ...data, _row_version: 1 });
        if (candidate.booked > candidate.tta) {
          throw new InputError("Booked action cannot exceed offered TTA");
        }
        return repos.rounds.create(data, id);
      },
      async update(id: string, patch: RoundPatch, expectedVersion: number) {
        const round = await repos.rounds.get(id);
        if (!round) throw new NotFoundError("Rounds", id);
        const session = await requiredSession(repos, round.session_id);
        assertOwnsSession(user, session);
        if (!isSessionOpen(session)) throw new AuthorizationError("Closed sessions cannot accept round changes");
        if (patch.session_id && patch.session_id !== round.session_id) {
          throw new AuthorizationError("A round cannot be moved");
        }
        const safePatch = withoutKeys(patch, ["session_id"]);
        const candidate = roundSchema.parse({ ...round, ...safePatch });
        if (candidate.booked > candidate.tta) {
          throw new InputError("Booked action cannot exceed offered TTA");
        }
        return repos.rounds.update(id, safePatch, expectedVersion);
      },
      async remove(id: string, expectedVersion: number) {
        const round = await repos.rounds.get(id);
        if (!round) throw new NotFoundError("Rounds", id);
        const session = await requiredSession(repos, round.session_id);
        assertOwnsSession(user, session);
        if (!isSessionOpen(session)) throw new AuthorizationError("Closed sessions cannot accept round changes");
        return repos.rounds.remove(id, expectedVersion);
      },
    },
    reimbursements: {
      list: () => repos.reimbursements.list(),
      get: (id) => repos.reimbursements.get(id),
      async create(data: ReimbursementCreate, id?: string) {
        if (!canRequestReimbursement(user)) throw new AuthorizationError("This account cannot file reimbursements");
        const fields = withoutKeys(data, ["status", "paid_at", "paid_by"]);
        const stamped = isConfiguredAccountRole(user.role)
          ? { ...fields, requested_by: user.name, requested_at: new Date().toISOString(), owner_id: user.userId }
          : { ...fields, requested_at: new Date().toISOString(), owner_id: user.userId };
        const payee = resolveSessionPlayer(
          { player: data.payee ?? "", player_id: data.payee_id ?? "" },
          user,
          team,
          stamped.requested_by,
        );
        if (!payee.player) throw new InputError("Who is owed is required");
        // A new reimbursement is always owed; only a settle (update) can mark it paid.
        return repos.reimbursements.create({ ...stamped, payee: payee.player, payee_id: payee.player_id }, id);
      },
      async update(id: string, patch: ReimbursementPatch, expectedVersion: number) {
        const item = await requiredReimbursement(repos, id);
        assertVersion("Reimbursements", id, item, expectedVersion);
        let safePatch: ReimbursementPatch = withoutKeys(patch, [
          "owner_id",
          "requested_at",
          "payee",
          "payee_id",
          "status",
          "paid_at",
          "paid_by",
          ...(user.role === "admin" ? [] : ["requested_by"]),
        ]);

        const settling = patch.status !== undefined && patch.status !== item.status;
        if (settling) {
          if (!canSettleReimbursements(user)) {
            throw new AuthorizationError("Only a partner or an admin can mark reimbursements paid");
          }
          safePatch = {
            ...safePatch,
            ...(patch.status === "paid"
              ? { status: "paid", paid_at: new Date().toISOString(), paid_by: user.name }
              : { status: "owed", paid_at: "", paid_by: "" }),
          };
        }

        const editsDetails = Object.keys(safePatch).some((key) => !["status", "paid_at", "paid_by"].includes(key));
        if (editsDetails && !canEditReimbursement(user, item)) {
          throw new AuthorizationError(
            item.status === "paid"
              ? "A paid reimbursement is locked; mark it unpaid first"
              : "Only whoever filed this, the person owed, or an admin can change it",
          );
        }

        if ("payee" in patch || "payee_id" in patch) {
          const next = resolveSessionPlayer(
            { player: patch.payee ?? "", player_id: patch.payee_id ?? "" },
            user,
            team,
            item.requested_by,
          );
          const changed = next.player !== item.payee || next.player_id !== item.payee_id;
          if (changed && !canReassignReimbursementPayee(user, item)) {
            throw new AuthorizationError("Only whoever filed this or an admin can change who is owed");
          }
          if (changed) safePatch = { ...safePatch, payee: next.player, payee_id: next.player_id };
        }

        return repos.reimbursements.update(id, safePatch, expectedVersion);
      },
      async remove(id: string, expectedVersion: number) {
        const item = await requiredReimbursement(repos, id);
        if (!canEditReimbursement(user, item)) {
          throw new AuthorizationError("Only whoever filed this, the person owed, or an admin can delete it while unpaid");
        }
        assertVersion("Reimbursements", id, item, expectedVersion);
        return repos.reimbursements.remove(id, expectedVersion);
      },
    },
    loans: {
      list: () => repos.loans.list(),
      get: (id) => repos.loans.get(id),
      async create(data: LoanEntryCreate, id?: string) {
        if (!canRecordLoans(user)) throw new AuthorizationError("This account cannot record loans");
        const recordedBy = isConfiguredAccountRole(user.role) ? user.name : data.recorded_by;
        const from = resolveSessionPlayer({ player: data.from_name ?? "", player_id: data.from_id ?? "" }, user, team, recordedBy);
        const to = resolveSessionPlayer({ player: data.to_name ?? "", player_id: data.to_id ?? "" }, user, team, recordedBy);
        if (!from.player || !to.player) throw new InputError("Both people are required");
        if (samePerson(from, to)) throw new InputError("A loan needs two different people");
        return repos.loans.create(
          {
            ...data,
            from_name: from.player,
            from_id: from.player_id,
            to_name: to.player,
            to_id: to.player_id,
            recorded_by: recordedBy,
            recorded_at: new Date().toISOString(),
            owner_id: user.userId,
          },
          id,
        );
      },
      async update(id: string, patch: LoanEntryPatch, expectedVersion: number) {
        const entry = await repos.loans.get(id);
        if (!entry) throw new NotFoundError("Loans", id);
        if (!canEditLoanEntry(user, entry)) {
          throw new AuthorizationError("Only whoever recorded this, the two people in it, or an admin can change it");
        }
        assertVersion("Loans", id, entry, expectedVersion);
        let safePatch: LoanEntryPatch = withoutKeys(patch, [
          "owner_id",
          "recorded_at",
          "from_name",
          "from_id",
          "to_name",
          "to_id",
          ...(user.role === "admin" ? [] : ["recorded_by"]),
        ]);
        const side = (nameKey: "from_name" | "to_name", idKey: "from_id" | "to_id") =>
          nameKey in patch || idKey in patch
            ? resolveSessionPlayer({ player: patch[nameKey] ?? "", player_id: patch[idKey] ?? "" }, user, team, entry.recorded_by)
            : { player: entry[nameKey], player_id: entry[idKey] };
        const from = side("from_name", "from_id");
        const to = side("to_name", "to_id");
        if (!from.player || !to.player) throw new InputError("Both people are required");
        if (samePerson(from, to)) throw new InputError("A loan needs two different people");
        safePatch = { ...safePatch, from_name: from.player, from_id: from.player_id, to_name: to.player, to_id: to.player_id };
        return repos.loans.update(id, safePatch, expectedVersion);
      },
      async remove(id: string, expectedVersion: number) {
        const entry = await repos.loans.get(id);
        if (!entry) throw new NotFoundError("Loans", id);
        if (!canEditLoanEntry(user, entry)) {
          throw new AuthorizationError("Only whoever recorded this, the two people in it, or an admin can delete it");
        }
        assertVersion("Loans", id, entry, expectedVersion);
        return repos.loans.remove(id, expectedVersion);
      },
    },
    payrollMembers: {
      list: () => repos.payrollMembers.list(),
      get: (id) => repos.payrollMembers.get(id),
      async create(data: PayrollMemberCreate, id?: string) {
        if (!canMarkPayrollPaid(user)) throw new AuthorizationError("Only Ray or an admin can change who is on payroll");
        const memberId = data.member_id.trim().toLowerCase();
        const member = team.find((candidate) => candidate.id === memberId);
        if (!member) throw new InputError("Payroll is for people with an account");
        const existing = (await (repos.payrollMembers.listFresh?.() ?? repos.payrollMembers.list())).find(
          (row) => row.member_id === memberId,
        );
        // Adding someone twice (two phones, or an offline retry) is a no-op rather than a duplicate row.
        if (existing) return existing;
        return repos.payrollMembers.create(
          { member_id: member.id, member_name: member.name, added_by: user.name, added_at: new Date().toISOString() },
          id,
        );
      },
      async update(): Promise<never> {
        throw new AuthorizationError("Remove the person from payroll and add them again instead");
      },
      async remove(id: string, expectedVersion: number) {
        if (!canMarkPayrollPaid(user)) throw new AuthorizationError("Only Ray or an admin can change who is on payroll");
        const row = await repos.payrollMembers.get(id);
        if (!row) throw new NotFoundError("PayrollMembers", id);
        assertVersion("PayrollMembers", id, row, expectedVersion);
        return repos.payrollMembers.remove(id, expectedVersion);
      },
    },
  };
}
