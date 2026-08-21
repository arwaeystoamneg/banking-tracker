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

/** `datetime-local` value in the user's local zone, e.g. "2026-08-21T14:30". */
export function toDateTimeLocalValue(date = new Date()): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

/** Interpret a `datetime-local` string as local time and return UTC ISO. */
export function dateTimeLocalToIso(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : value;
}

export function formatDateTimeForDisplay(iso: string): string {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) return iso || "—";
  return format(parsed, "MMM d, yyyy h:mm a");
}
