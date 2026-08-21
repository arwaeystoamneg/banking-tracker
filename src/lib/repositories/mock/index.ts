import { makeId } from "@/lib/ids";
import type { Repositories } from "@/lib/repositories/types";
import { createMockRepository } from "@/lib/repositories/mock/mockRepository";
import {
  feeScheduleSchema,
  gameSchema,
  paytableSchema,
  roundSchema,
  sessionSchema,
  sidebetSchema,
} from "@/lib/validation/schemas";

export function createMockRepositories(): Repositories {
  return {
    games: createMockRepository({
      tab: "Games",
      table: "games",
      idField: "game_id",
      makeId: () => makeId("game"),
      rowSchema: gameSchema,
    }),
    sidebets: createMockRepository({
      tab: "Sidebets",
      table: "sidebets",
      idField: "sidebet_id",
      makeId: () => makeId("sidebet"),
      rowSchema: sidebetSchema,
    }),
    paytables: createMockRepository({
      tab: "Paytables",
      table: "paytables",
      idField: "paytable_id",
      makeId: () => makeId("paytable"),
      rowSchema: paytableSchema,
    }),
    feeSchedules: createMockRepository({
      tab: "FeeSchedules",
      table: "feeSchedules",
      idField: "schedule_id",
      makeId: () => makeId("feeSchedule"),
      rowSchema: feeScheduleSchema,
    }),
    sessions: createMockRepository({
      tab: "Sessions",
      table: "sessions",
      idField: "session_id",
      makeId: () => makeId("session"),
      rowSchema: sessionSchema,
    }),
    rounds: createMockRepository({
      tab: "Rounds",
      table: "rounds",
      idField: "round_id",
      makeId: () => makeId("round"),
      rowSchema: roundSchema,
    }),
  };
}
