import type { AuthUser } from "@/lib/auth/types";
import type { Game, Session } from "@/lib/validation/schemas";

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
  if (user.role !== "individual") return false;
  return isGameRecordOwner(user, game);
}

export function ownsSession(user: AuthUser, session: Session): boolean {
  if (user.role === "admin") return true;
  if (user.role !== "individual") return false;
  return isSessionRecordOwner(user, session);
}
