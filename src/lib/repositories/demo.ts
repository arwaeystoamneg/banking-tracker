import "server-only";

import seed from "@/lib/repositories/mock/fixtures/seed.json";
import type { CrudRepository, Repositories } from "@/lib/repositories/types";
import {
  feeScheduleSchema,
  gameSchema,
  paytableSchema,
  roundSchema,
  sessionSchema,
  sidebetSchema,
} from "@/lib/validation/schemas";
import { AuthorizationError } from "@/lib/auth/session";

function fixtureRepository<T, TCreate, TPatch>(
  rows: T[],
  idField: keyof T,
): CrudRepository<T, TCreate, TPatch> {
  const deny = async (): Promise<never> => {
    throw new AuthorizationError("The demo is read-only");
  };

  return {
    async list() {
      return rows;
    },
    async get(id) {
      return rows.find((row) => row[idField] === id) ?? null;
    },
    create: deny,
    update: deny,
    remove: deny,
  };
}

function lockRepository<T, TCreate, TPatch>(
  repository: CrudRepository<T, TCreate, TPatch>,
): CrudRepository<T, TCreate, TPatch> {
  const deny = async (): Promise<never> => {
    throw new AuthorizationError("The demo is read-only");
  };
  return {
    list: () => repository.list(),
    get: (id) => repository.get(id),
    create: deny,
    update: deny,
    remove: deny,
  };
}

function lockRepositories(base: Repositories): Repositories {
  return {
    games: lockRepository(base.games),
    sidebets: lockRepository(base.sidebets),
    paytables: lockRepository(base.paytables),
    feeSchedules: lockRepository(base.feeSchedules),
    sessions: lockRepository(base.sessions),
    rounds: lockRepository(base.rounds),
  };
}

let repositoriesPromise: Promise<Repositories> | undefined;

/** Uses the separate demo spreadsheet when configured, otherwise the bundled public fixture. */
export async function getDemoRepositories(): Promise<Repositories> {
  if (repositoriesPromise) return repositoriesPromise;

  repositoriesPromise = (async () => {
    const demoSheetId = process.env.DEMO_SHEET_ID;
    if (demoSheetId) {
      if (demoSheetId === process.env.SHEET_ID) {
        throw new Error("DEMO_SHEET_ID must not match the live SHEET_ID");
      }
      const { createSheetsRepositories } = await import("@/lib/repositories/sheets");
      return lockRepositories(createSheetsRepositories(demoSheetId));
    }

    const games = seed.games.map((row) => gameSchema.parse(row));
    const sidebets = seed.sidebets.map((row) => sidebetSchema.parse(row));
    const paytables = seed.paytables.map((row) => paytableSchema.parse(row));
    const feeSchedules = seed.feeSchedules.map((row) => feeScheduleSchema.parse(row));
    const sessions = seed.sessions.map((row) => sessionSchema.parse(row));
    const rounds = seed.rounds.map((row) => roundSchema.parse(row));

    return {
      games: fixtureRepository(games, "game_id"),
      sidebets: fixtureRepository(sidebets, "sidebet_id"),
      paytables: fixtureRepository(paytables, "paytable_id"),
      feeSchedules: fixtureRepository(feeSchedules, "schedule_id"),
      sessions: fixtureRepository(sessions, "session_id"),
      rounds: fixtureRepository(rounds, "round_id"),
    };
  })();

  return repositoriesPromise;
}
