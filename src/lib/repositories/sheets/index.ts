import "server-only";
import { makeId } from "@/lib/ids";
import type { Repositories } from "@/lib/repositories/types";
import { createSheetsRepository } from "@/lib/repositories/sheets/sheetsRepository";
import {
  AUDIT_LOG_TAB,
  FEE_SCHEDULES_TAB,
  GAMES_TAB,
  LOSS_EVIDENCE_TAB,
  LOSS_REPORTS_TAB,
  PAYTABLES_TAB,
  ROUNDS_TAB,
  SESSIONS_TAB,
  SIDEBETS_TAB,
} from "@/lib/repositories/sheets/tabs";
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
import { toAppendOnly, toLossReportRepository } from "@/lib/repositories/appendOnly";
import { getSheetId } from "@/lib/repositories/sheets/client";

export function createSheetsRepositories(spreadsheetId = getSheetId()): Repositories {
  return {
    games: createSheetsRepository({
      tab: "Games",
      tabConfig: GAMES_TAB,
      makeId: () => makeId("game"),
      rowSchema: gameSchema,
      spreadsheetId,
    }),
    sidebets: createSheetsRepository({
      tab: "Sidebets",
      tabConfig: SIDEBETS_TAB,
      makeId: () => makeId("sidebet"),
      rowSchema: sidebetSchema,
      spreadsheetId,
    }),
    paytables: createSheetsRepository({
      tab: "Paytables",
      tabConfig: PAYTABLES_TAB,
      makeId: () => makeId("paytable"),
      rowSchema: paytableSchema,
      spreadsheetId,
    }),
    feeSchedules: createSheetsRepository({
      tab: "FeeSchedules",
      tabConfig: FEE_SCHEDULES_TAB,
      makeId: () => makeId("feeSchedule"),
      rowSchema: feeScheduleSchema,
      spreadsheetId,
    }),
    sessions: createSheetsRepository({
      tab: "Sessions",
      tabConfig: SESSIONS_TAB,
      makeId: () => makeId("session"),
      rowSchema: sessionSchema,
      spreadsheetId,
    }),
    rounds: createSheetsRepository({
      tab: "Rounds",
      tabConfig: ROUNDS_TAB,
      makeId: () => makeId("round"),
      rowSchema: roundSchema,
      spreadsheetId,
    }),
    lossReports: toLossReportRepository(
      createSheetsRepository({
        tab: "LossReports",
        tabConfig: LOSS_REPORTS_TAB,
        makeId: () => makeId("lossReport"),
        rowSchema: lossReportSchema,
        spreadsheetId,
      }),
    ),
    lossEvidence: toAppendOnly(
      createSheetsRepository({
        tab: "LossEvidence",
        tabConfig: LOSS_EVIDENCE_TAB,
        makeId: () => makeId("lossEvidence"),
        rowSchema: lossEvidenceSchema,
        spreadsheetId,
      }),
    ),
    auditLog: toAppendOnly(
      createSheetsRepository({
        tab: "AuditLog",
        tabConfig: AUDIT_LOG_TAB,
        makeId: () => makeId("auditEntry"),
        rowSchema: auditEntrySchema,
        spreadsheetId,
      }),
    ),
  };
}
