import type { Session } from "@/lib/validation/schemas";

/** Cash-complete sessions close without round data; legacy round sessions use their existing close totals. */
export function isSessionOpen(session: Session): boolean {
  if (session.buy_out !== null && session.time_out !== "") return false;
  if (session.rounds_banked !== null && session.collection_paid !== null) return false;
  return true;
}

/** Who played the session. Legacy rows have no player column and were always logged by the player. */
export function sessionPlayerName(session: Pick<Session, "player" | "logged_by">): string {
  return session.player.trim() || session.logged_by.trim();
}

/** True when someone other than the player entered the session. */
export function loggedOnBehalf(session: Pick<Session, "player" | "logged_by">): boolean {
  const player = session.player.trim();
  return player !== "" && player.toLowerCase() !== session.logged_by.trim().toLowerCase();
}
