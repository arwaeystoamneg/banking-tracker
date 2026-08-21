import "server-only";

import type { AuthUser } from "@/lib/auth/types";
import {
  canReviewLossReport,
  canSeeAllLossReports,
  canSubmitLossReport,
  ownsLossReport,
} from "@/lib/auth/permissions";
import { AuthorizationError, InputError } from "@/lib/auth/session";
import { ConflictError, NotFoundError, type Repositories } from "@/lib/repositories/types";
import type { AuditEntryCreate, LossEvidenceCreate, LossReportCreate } from "@/lib/repositories/inferred";
import { LOSS_STATUS_TRANSITIONS, type LossReport } from "@/lib/validation/schemas";

type LossRepositories = Pick<Repositories, "lossReports" | "lossEvidence" | "auditLog">;

async function requiredLossReport(repos: Repositories, id: string): Promise<LossReport> {
  const report = await repos.lossReports.get(id);
  if (!report) throw new NotFoundError("LossReports", id);
  return report;
}

function canSeeReport(user: AuthUser, report: LossReport): boolean {
  return canSeeAllLossReports(user) || ownsLossReport(user, report);
}

/**
 * The authorization wrapper for the three append-only loss-reporting tabs.
 *
 * Two invariants live here rather than in the route handlers, so they hold no matter which caller
 * reaches the data layer:
 *
 * 1. Identity and receipt time are stamped from the session, never read from the caller's payload.
 * 2. A status transition and its AuditLog entry are written by the same call — there is no code path
 *    that moves a report's status without also appending an audit row.
 */
export function createLossRepositories(repos: Repositories, user: AuthUser): LossRepositories {
  return {
    lossReports: {
      async list() {
        const rows = await repos.lossReports.list();
        return canSeeAllLossReports(user) ? rows : rows.filter((row) => ownsLossReport(user, row));
      },

      async get(id: string) {
        const report = await repos.lossReports.get(id);
        if (!report) return null;
        return canSeeReport(user, report) ? report : null;
      },

      async create(data: LossReportCreate, id?: string) {
        if (!canSubmitLossReport(user)) throw new AuthorizationError("This account cannot file loss reports");
        return repos.lossReports.create(
          {
            ...data,
            // Everything below is server-owned. Assigning after the spread is what makes a
            // client-supplied submitted_by or pre-decided status impossible, not merely ignored.
            reported_at: new Date().toISOString(),
            status: "submitted",
            submitted_by: user.name,
            owner_id: user.userId,
            reviewed_by: "",
            reviewed_at: "",
            review_note: "",
            second_attestor: "",
          },
          id,
        );
      },

      async recordDecision(id, decision, expectedVersion) {
        if (!canReviewLossReport(user)) throw new AuthorizationError("Only an admin can decide a loss report");
        const report = await requiredLossReport(repos, id);
        if (report._row_version !== expectedVersion) throw new ConflictError("LossReports", id, report);

        if (!LOSS_STATUS_TRANSITIONS[report.status].includes(decision.status)) {
          throw new InputError(`A ${report.status} report cannot move to ${decision.status}`);
        }

        const at = new Date().toISOString();
        const updated = await repos.lossReports.recordDecision(
          id,
          {
            status: decision.status,
            review_note: decision.review_note,
            second_attestor: decision.second_attestor.trim(),
            reviewed_by: user.name,
            reviewed_at: at,
          },
          expectedVersion,
        );

        // Written after the transition lands, so the log never claims a change that did not happen.
        // Sheets has no transactions: if this append fails the caller sees a 500 with the status
        // already moved, and a retry surfaces a version conflict rather than double-applying.
        await repos.auditLog.create({
          loss_id: id,
          at,
          actor: user.name,
          from_status: report.status,
          to_status: updated.status,
          note: decision.review_note,
        });

        return updated;
      },
    },

    lossEvidence: {
      async list() {
        const rows = await repos.lossEvidence.list();
        if (canSeeAllLossReports(user)) return rows;
        const visible = new Set(
          (await repos.lossReports.list()).filter((report) => ownsLossReport(user, report)).map((r) => r.loss_id),
        );
        return rows.filter((row) => visible.has(row.loss_id));
      },

      async get(id: string) {
        const row = await repos.lossEvidence.get(id);
        if (!row) return null;
        if (canSeeAllLossReports(user)) return row;
        const report = await repos.lossReports.get(row.loss_id);
        return report && ownsLossReport(user, report) ? row : null;
      },

      async create(data: LossEvidenceCreate, id?: string) {
        if (!canSubmitLossReport(user)) throw new AuthorizationError("This account cannot file loss reports");
        const report = await requiredLossReport(repos, data.loss_id);
        if (!ownsLossReport(user, report) && user.role !== "admin") {
          throw new AuthorizationError("Evidence can only be attached to a report you filed");
        }
        if (report.status !== "submitted") {
          throw new AuthorizationError("Evidence cannot be added once a report is under review");
        }
        return repos.lossEvidence.create(
          { ...data, uploaded_at: new Date().toISOString(), uploaded_by: user.name },
          id,
        );
      },
    },

    auditLog: {
      async list() {
        const rows = await repos.auditLog.list();
        if (canSeeAllLossReports(user)) return rows;
        const visible = new Set(
          (await repos.lossReports.list()).filter((report) => ownsLossReport(user, report)).map((r) => r.loss_id),
        );
        return rows.filter((row) => visible.has(row.loss_id));
      },

      async get(id: string) {
        const row = await repos.auditLog.get(id);
        if (!row) return null;
        if (canSeeAllLossReports(user)) return row;
        const report = await repos.lossReports.get(row.loss_id);
        return report && ownsLossReport(user, report) ? row : null;
      },

      // The audit log is written by recordDecision above and nowhere else. Exposing a create() that
      // any route could call would let an actor forge history, which defeats the point of the tab.
      async create(_data: AuditEntryCreate) {
        throw new AuthorizationError("Audit entries are written by the review workflow, not directly");
      },
    },
  };
}
