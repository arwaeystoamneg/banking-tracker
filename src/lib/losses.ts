import { LOSS_STATUS_TRANSITIONS, type LossReport, type LossStatus, type Session } from "@/lib/validation/schemas";

/**
 * A session whose gross W/L is this far below zero with no linked LossReport is the theft vector
 * the rest of the feature doesn't catch. A $500+ hole in the $8k working bank should still surface.
 */
export const UNREPORTED_LOSS_THRESHOLD = 500;

const STATUS_RANK: Record<LossStatus, number> = {
  submitted: 0,
  in_review: 1,
  disputed: 2,
  verified: 3,
  rejected: 4,
};

export const LOSS_STATUS_LABEL: Record<LossStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  disputed: "Disputed",
  verified: "Verified",
  rejected: "Rejected",
};

export function lossStatusRank(status: LossStatus): number {
  return STATUS_RANK[status];
}

export function nextLossStatuses(status: LossStatus) {
  return LOSS_STATUS_TRANSITIONS[status];
}

/** Milliseconds between claimed occurrence and server receipt. Null if either stamp is unparseable. */
export function reportingDelayMs(report: Pick<LossReport, "occurred_at" | "reported_at">): number | null {
  const occurred = Date.parse(report.occurred_at);
  const reported = Date.parse(report.reported_at);
  if (!Number.isFinite(occurred) || !Number.isFinite(reported)) return null;
  return reported - occurred;
}

export function formatReportingDelay(ms: number | null): string {
  if (ms === null) return "unknown delay";
  const abs = Math.abs(ms);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return ms >= 0 ? "filed immediately" : "filed before it occurred";
  if (minutes < 60) return `${minutes}m ${ms >= 0 ? "later" : "early"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ${ms >= 0 ? "later" : "early"}`;
  const days = Math.round(hours / 24);
  return `${days}d ${ms >= 0 ? "later" : "early"}`;
}

export function compareLossQueue(a: LossReport, b: LossReport): number {
  const byStatus = lossStatusRank(a.status) - lossStatusRank(b.status);
  if (byStatus !== 0) return byStatus;
  const delayA = reportingDelayMs(a) ?? 0;
  const delayB = reportingDelayMs(b) ?? 0;
  if (delayA !== delayB) return delayB - delayA;
  return a.reported_at < b.reported_at ? 1 : a.reported_at > b.reported_at ? -1 : 0;
}

/**
 * Sessions with a large negative gross W/L and no LossReport pointing at them.
 * Matching is by session_id only — an unlinked report does not clear the flag, which is
 * the conservative read for a queue a person still has to look at.
 */
export function findUnreportedLossSessions(
  sessions: Session[],
  reports: LossReport[],
  threshold = UNREPORTED_LOSS_THRESHOLD,
): Session[] {
  const linked = new Set(reports.map((report) => report.session_id).filter(Boolean));
  return sessions
    .filter((session) => {
      if (linked.has(session.session_id)) return false;
      if (session.gross_wl === null || session.gross_wl === undefined) return false;
      return session.gross_wl <= -threshold;
    })
    .sort((a, b) => (a.gross_wl ?? 0) - (b.gross_wl ?? 0));
}
