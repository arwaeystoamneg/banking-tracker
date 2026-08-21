import { format } from "date-fns";

/** Plain calendar date, e.g. "2026-08-20". No timezone handling — all activity is single-timezone (CA cardrooms). */
export function todayDateString(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function currentTimeString(): string {
  return format(new Date(), "HH:mm");
}

export function formatDateForDisplay(dateString: string): string {
  return format(new Date(`${dateString}T00:00:00`), "MMM d, yyyy");
}
