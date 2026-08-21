import type { Session } from "@/lib/validation/schemas";

/** Cash-complete sessions close without round data; legacy round sessions use their existing close totals. */
export function isSessionOpen(session: Session): boolean {
  if (session.buy_out !== null && session.time_out !== "") return false;
  if (session.rounds_banked !== null && session.collection_paid !== null) return false;
  return true;
}
