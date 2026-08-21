import { isConfiguredAccountRole, type AuthUser } from "@/lib/auth/types";
import type { Game, LossReport, Session } from "@/lib/validation/schemas";

export function sameIdentity(value: string, user: AuthUser): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === user.userId.toLowerCase() || normalized === user.name.trim().toLowerCase();
}

/** True when this user is the recorded owner — admin bypass is intentionally not applied. */
function isGameRecordOwner(user: AuthUser, game: Pick<Game, "owner_id" | "edited_by">): boolean {
  if (user.role === "demo") return false;
  return game.owner_id.trim() ? sameIdentity(game.owner_id, user) : sameIdentity(game.edited_by, user);
}

function isSessionRecordOwner(user: AuthUser, session: Pick<Session, "owner_id" | "logged_by">): boolean {
  if (user.role === "demo") return false;
  return session.owner_id.trim() ? sameIdentity(session.owner_id, user) : sameIdentity(session.logged_by, user);
}

export function ownsGame(user: AuthUser, game: Game): boolean {
  if (user.role === "admin") return true;
  if (!isConfiguredAccountRole(user.role)) return false;
  return isGameRecordOwner(user, game);
}

export function ownsSession(user: AuthUser, session: Session): boolean {
  if (user.role === "admin") return true;
  if (!isConfiguredAccountRole(user.role)) return false;
  return isSessionRecordOwner(user, session);
}

/* ------------------------------------------------------------------------------------------------
 * Big-loss reporting. Three separate questions, kept apart on purpose: who may file a report, who
 * may decide one, and who may see reports they did not file.
 * ---------------------------------------------------------------------------------------------- */

/** Anyone with a real account files their own losses. The demo never writes. */
export function canSubmitLossReport(user: AuthUser): boolean {
  return user.role === "admin" || user.role === "individual" || user.role === "employee";
}

/** Deciding a report is an admin act — an employee cannot verify their own or anyone else's loss. */
export function canReviewLossReport(user: AuthUser): boolean {
  return user.role === "admin";
}

/** Anyone with a real account sees the whole queue. The demo never does. Review is still admin-only. */
export function canSeeAllLossReports(user: AuthUser): boolean {
  return user.role === "admin" || isConfiguredAccountRole(user.role);
}

export function ownsLossReport(user: AuthUser, report: Pick<LossReport, "owner_id" | "submitted_by">): boolean {
  if (user.role === "demo") return false;
  return report.owner_id.trim() ? sameIdentity(report.owner_id, user) : sameIdentity(report.submitted_by, user);
}
