import "server-only";
import { makeId } from "@/lib/ids";
import type { Repositories } from "@/lib/repositories/types";
import { createSheetsRepository } from "@/lib/repositories/sheets/sheetsRepository";
import {
  FEE_SCHEDULES_TAB,
  GAMES_TAB,
  PAYTABLES_TAB,
  ROUNDS_TAB,
  SESSIONS_TAB,
  SIDEBETS_TAB,
} from "@/lib/repositories/sheets/tabs";
import {
  feeScheduleSchema,
  gameSchema,
  paytableSchema,
  roundSchema,
  sessionSchema,
  sidebetSchema,
} from "@/lib/validation/schemas";

export function createSheetsRepositories(): Repositories {
  return {
    games: createSheetsRepository({ tab: "Games", tabConfig: GAMES_TAB, makeId: () => makeId("game"), rowSchema: gameSchema }),
    sidebets: createSheetsRepository({
      tab: "Sidebets",
      tabConfig: SIDEBETS_TAB,
      makeId: () => makeId("sidebet"),
      rowSchema: sidebetSchema,
    }),
    paytables: createSheetsRepository({
      tab: "Paytables",
      tabConfig: PAYTABLES_TAB,
      makeId: () => makeId("paytable"),
      rowSchema: paytableSchema,
    }),
    feeSchedules: createSheetsRepository({
      tab: "FeeSchedules",
      tabConfig: FEE_SCHEDULES_TAB,
      makeId: () => makeId("feeSchedule"),
      rowSchema: feeScheduleSchema,
    }),
    sessions: createSheetsRepository({
      tab: "Sessions",
      tabConfig: SESSIONS_TAB,
      makeId: () => makeId("session"),
      rowSchema: sessionSchema,
    }),
    rounds: createSheetsRepository({ tab: "Rounds", tabConfig: ROUNDS_TAB, makeId: () => makeId("round"), rowSchema: roundSchema }),
  };
}
