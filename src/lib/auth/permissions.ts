import { isConfiguredAccountRole, type AuthUser } from "@/lib/auth/types";
import type { Game, LoanEntry, LossReport, Reimbursement, Session } from "@/lib/validation/schemas";

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

/**
 * May change the session and its rounds: the person who logged it, the player it was logged for, or an
 * admin. A teammate logging on someone's behalf must not lock the player out of their own session.
 */
export function ownsSession(user: AuthUser, session: Session): boolean {
  if (user.role === "admin") return true;
  if (!isConfiguredAccountRole(user.role)) return false;
  if (session.player_id.trim() && sameIdentity(session.player_id, user)) return true;
  return isSessionRecordOwner(user, session);
}

/** Reassigning who played is reserved for whoever logged it (or an admin), not the player. */
export function canReassignSessionPlayer(user: AuthUser, session: Session): boolean {
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

/* ------------------------------------------------------------------------------------------------
 * Reimbursements. Anyone with a real account can file one; the person who filed it and the person
 * owed can fix it while it is unpaid; partners (individual accounts) and admin settle them.
 * ---------------------------------------------------------------------------------------------- */

function isReimbursementRecordOwner(
  user: AuthUser,
  item: Pick<Reimbursement, "owner_id" | "requested_by">,
): boolean {
  if (user.role === "demo") return false;
  return item.owner_id.trim() ? sameIdentity(item.owner_id, user) : sameIdentity(item.requested_by, user);
}

export function canRequestReimbursement(user: AuthUser): boolean {
  return user.role === "admin" || isConfiguredAccountRole(user.role);
}

/** Marking paid moves money, so employees can file but not settle — not even their own. */
export function canSettleReimbursements(user: AuthUser): boolean {
  return user.role === "admin" || user.role === "individual";
}

/** May edit or delete: whoever filed it, the person owed, or admin — and only admin once it's paid. */
export function canEditReimbursement(user: AuthUser, item: Reimbursement): boolean {
  if (user.role === "admin") return true;
  if (!isConfiguredAccountRole(user.role) || item.status === "paid") return false;
  if (item.payee_id.trim() && sameIdentity(item.payee_id, user)) return true;
  return isReimbursementRecordOwner(user, item);
}

/** Changing who is owed is reserved for whoever filed it (or admin), not the payee. */
export function canReassignReimbursementPayee(user: AuthUser, item: Reimbursement): boolean {
  if (user.role === "admin") return true;
  if (!isConfiguredAccountRole(user.role) || item.status === "paid") return false;
  return isReimbursementRecordOwner(user, item);
}

/* ------------------------------------------------------------------------------------------------
 * Loans between teammates. Anyone with an account records them; the person who recorded an entry,
 * either side of it, or admin can fix or delete it.
 * ---------------------------------------------------------------------------------------------- */

export function canRecordLoans(user: AuthUser): boolean {
  return user.role === "admin" || isConfiguredAccountRole(user.role);
}

export function canEditLoanEntry(
  user: AuthUser,
  entry: Pick<LoanEntry, "owner_id" | "recorded_by" | "from_id" | "to_id">,
): boolean {
  if (user.role === "admin") return true;
  if (!isConfiguredAccountRole(user.role)) return false;
  if ([entry.from_id, entry.to_id].some((id) => id.trim() && sameIdentity(id, user))) return true;
  return entry.owner_id.trim() ? sameIdentity(entry.owner_id, user) : sameIdentity(entry.recorded_by, user);
}
