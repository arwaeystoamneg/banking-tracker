import "server-only";

import seed from "@/lib/repositories/mock/fixtures/seed.json";
import type {
  AppendOnlyRepository,
  CrudRepository,
  LossReportRepository,
  Repositories,
} from "@/lib/repositories/types";
import {
  auditEntrySchema,
  feeScheduleSchema,
  gameSchema,
  lossEvidenceSchema,
  lossReportSchema,
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

function appendOnlyFixtureRepository<T, TCreate>(
  rows: T[],
  idField: keyof T,
): AppendOnlyRepository<T, TCreate> {
  return {
    async list() {
      return rows;
    },
    async get(id) {
      return rows.find((row) => row[idField] === id) ?? null;
    },
    create: async () => {
      throw new AuthorizationError("The demo is read-only");
    },
  };
}

function lockAppendOnly<T, TCreate>(
  repository: AppendOnlyRepository<T, TCreate>,
): AppendOnlyRepository<T, TCreate> {
  return {
    list: () => repository.list(),
    get: (id) => repository.get(id),
    create: async () => {
      throw new AuthorizationError("The demo is read-only");
    },
  };
}

function lockLossReports(repository: LossReportRepository): LossReportRepository {
  const deny = async (): Promise<never> => {
    throw new AuthorizationError("The demo is read-only");
  };
  return { ...lockAppendOnly(repository), recordDecision: deny };
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
    lossReports: lockLossReports(base.lossReports),
    lossEvidence: lockAppendOnly(base.lossEvidence),
    auditLog: lockAppendOnly(base.auditLog),
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
    const lossReports = seed.lossReports.map((row) => lossReportSchema.parse(row));
    const lossEvidence = seed.lossEvidence.map((row) => lossEvidenceSchema.parse(row));
    const auditLog = seed.auditLog.map((row) => auditEntrySchema.parse(row));

    return {
      games: fixtureRepository(games, "game_id"),
      sidebets: fixtureRepository(sidebets, "sidebet_id"),
      paytables: fixtureRepository(paytables, "paytable_id"),
      feeSchedules: fixtureRepository(feeSchedules, "schedule_id"),
      sessions: fixtureRepository(sessions, "session_id"),
      rounds: fixtureRepository(rounds, "round_id"),
      lossReports: {
        ...appendOnlyFixtureRepository(lossReports, "loss_id"),
        recordDecision: async () => {
          throw new AuthorizationError("The demo is read-only");
        },
      },
      lossEvidence: appendOnlyFixtureRepository(lossEvidence, "evidence_id"),
      auditLog: appendOnlyFixtureRepository(auditLog, "entry_id"),
    };
  })();

  return repositoriesPromise;
}
