import type { Session } from "@/lib/validation/schemas";

/** A session is "open" while it has no recorded collection paid — no separate status column. */
export function isSessionOpen(session: Session): boolean {
  return session.collection_paid === null;
}
