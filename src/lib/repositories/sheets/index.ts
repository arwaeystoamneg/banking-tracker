import "server-only";
import { makeId } from "@/lib/ids";
import type { Repositories } from "@/lib/repositories/types";
import { createSheetsRepository } from "@/lib/repositories/sheets/sheetsRepository";
import {
  AUDIT_LOG_TAB,
  FEE_SCHEDULES_TAB,
  GAMES_TAB,
  LOANS_TAB,
  LOSS_EVIDENCE_TAB,
  LOSS_REPORTS_TAB,
  PAYTABLES_TAB,
  PAYROLL_MEMBERS_TAB,
  REIMBURSEMENTS_TAB,
  ROUNDS_TAB,
  SESSIONS_TAB,
  SIDEBETS_TAB,
} from "@/lib/repositories/sheets/tabs";
import {
  auditEntrySchema,
  feeScheduleSchema,
  gameSchema,
  loanEntrySchema,
  lossEvidenceSchema,
  lossReportSchema,
  paytableSchema,
  payrollMemberSchema,
  reimbursementSchema,
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
    reimbursements: createSheetsRepository({
      tab: "Reimbursements",
      tabConfig: REIMBURSEMENTS_TAB,
      makeId: () => makeId("reimbursement"),
      rowSchema: reimbursementSchema,
      spreadsheetId,
    }),
    payrollMembers: createSheetsRepository({
      tab: "PayrollMembers",
      tabConfig: PAYROLL_MEMBERS_TAB,
      makeId: () => makeId("payrollMember"),
      rowSchema: payrollMemberSchema,
      spreadsheetId,
    }),
    loans: createSheetsRepository({
      tab: "Loans",
      tabConfig: LOANS_TAB,
      makeId: () => makeId("loanEntry"),
      rowSchema: loanEntrySchema,
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
