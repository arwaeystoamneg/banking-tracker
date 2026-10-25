import { format, subDays } from "date-fns";

/** Plain calendar date, e.g. "2026-08-20". No timezone handling — all activity is single-timezone (CA cardrooms). */
export function todayDateString(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/**
 * The calendar date a session started, given its time in. Sessions are dated by when they started, and most
 * run past midnight, so one logged at 1am with a time in of 7:30pm started yesterday. A time in more than a
 * few minutes ahead of now can't be today (a session can't start in the future), so it means yesterday.
 */
export function startDateForTimeIn(timeIn: string, now = new Date()): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(timeIn.trim());
  if (!match) return format(now, "yyyy-MM-dd");
  const startMinutes = Number(match[1]) * 60 + Number(match[2]);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return format(startMinutes > nowMinutes + 5 ? subDays(now, 1) : now, "yyyy-MM-dd");
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
