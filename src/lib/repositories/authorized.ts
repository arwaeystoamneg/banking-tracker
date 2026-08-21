import "server-only";

import { isConfiguredAccountRole, type AuthUser } from "@/lib/auth/types";
import { ownsGame, ownsSession } from "@/lib/auth/permissions";
import { AuthorizationError, InputError } from "@/lib/auth/session";
import type { Repositories } from "@/lib/repositories/types";
import { ConflictError, NotFoundError } from "@/lib/repositories/types";
import { createLossRepositories } from "@/lib/repositories/losses";
import type {
  FeeScheduleCreate,
  FeeSchedulePatch,
  GameCreate,
  GamePatch,
  PaytableCreate,
  PaytablePatch,
  RoundCreate,
  RoundPatch,
  SessionCreate,
  SessionPatch,
  SidebetCreate,
  SidebetPatch,
} from "@/lib/repositories/inferred";
import { roundSchema, sessionSchema, type Game, type Session, type Sidebet } from "@/lib/validation/schemas";
import { isSessionOpen } from "@/lib/sessionHelpers";

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
 * Wraps the data layer so every mutation is authorized even if a route handler is later
 * added outside proxy coverage. Reads remain shared for every real account.
 */
export function createAuthorizedRepositories(repos: Repositories, user: AuthUser): Repositories {
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
      async create(data: SessionCreate, id?: string) {
        const stamped = isConfiguredAccountRole(user.role)
          ? {
              ...data,
              logged_by: user.name,
              logged_at: new Date().toISOString(),
              owner_id: user.userId,
            }
          : { ...data, owner_id: user.userId };
        const candidate = sessionSchema.parse({ session_id: id ?? "pending", ...stamped, _row_version: 1 });
        if (!isSessionOpen(candidate) && candidate.coverage_pct === null) {
          throw new InputError("A session cannot be created closed without coverage data");
        }
        return repos.sessions.create(stamped, id);
      },
      async update(id: string, patch: SessionPatch, expectedVersion: number) {
        const session = await requiredSession(repos, id);
        assertOwnsSession(user, session);
        assertVersion("Sessions", id, session, expectedVersion);
        const safePatch = withoutKeys(patch, [
          "owner_id",
          "logged_at",
          ...(user.role === "admin" ? [] : ["logged_by"]),
        ]);
        const candidate = sessionSchema.parse({ ...session, ...safePatch });
        if (isSessionOpen(session) && !isSessionOpen(candidate)) {
          const roundCount = (await repos.rounds.list()).filter((round) => round.session_id === id).length;
          if (roundCount === 0 || candidate.coverage_pct === null) {
            throw new InputError("Close sessions through the round summary with at least one round and coverage");
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
  };
}
