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

/** Cardrooms are all in California; the server runs in UTC, so wall-clock comparisons use this zone. */
const CARDROOM_TIME_ZONE = "America/Los_Angeles";

/** "YYYY-MM-DD HH:mm" in cardroom time — sortable as a string. */
function cardroomStamp(at: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: CARDROOM_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function previousDay(date: string): string {
  return format(subDays(new Date(`${date}T12:00:00`), 1), "yyyy-MM-dd");
}

/**
 * Server-side safety net for the after-midnight mistake: a session whose start (date + time in) is in the
 * future can't be right, and when the same time a day earlier is in the past, that's when it started —
 * e.g. stamped Oct 23 with time in 7:30pm, saved at 1am on Oct 23. Anything further off is left alone.
 */
export function correctFutureStartDate(date: string, timeIn: string, now = new Date()): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(timeIn.trim());
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const time = `${match[1].padStart(2, "0")}:${match[2]}`;
  const limit = cardroomStamp(new Date(now.getTime() + 5 * 60_000));
  if (`${date} ${time}` <= limit) return date;
  const earlier = previousDay(date);
  return `${earlier} ${time}` <= limit ? earlier : date;
}

/**
 * A time as the app stores it ("19:30"), from however it reached the sheet: typed by hand as "7:30 PM", "7pm" or
 * "7:30:00 PM", or shown by Sheets as "19:30:00". Without this "7:30 PM" read as 7:30 in the morning. Anything
 * unrecognizable is returned trimmed, unchanged.
 */
export function normalizeTime(value: string): string {
  const text = value.trim();
  const twelve = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([ap])\.?\s*m?\.?$/i.exec(text);
  if (twelve) {
    const hour = Number(twelve[1]);
    const minute = twelve[2] ?? "00";
    if (hour < 1 || hour > 12 || Number(minute) > 59) return text;
    const pm = twelve[3].toLowerCase() === "p";
    return `${String((hour % 12) + (pm ? 12 : 0)).padStart(2, "0")}:${minute}`;
  }
  const day = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
  if (day && Number(day[1]) < 24 && Number(day[2]) < 60) return `${day[1].padStart(2, "0")}:${day[2]}`;
  return text;
}

/** How far cardroom wall-clock time is ahead of UTC at this instant, in minutes (−420 or −480). */
function cardroomOffsetMinutes(at: number): number {
  const stamp = cardroomStamp(new Date(at));
  const wall = Date.UTC(+stamp.slice(0, 4), +stamp.slice(5, 7) - 1, +stamp.slice(8, 10), +stamp.slice(11, 13), +stamp.slice(14, 16));
  return Math.round((wall - Math.floor(at / 60_000) * 60_000) / 60_000);
}

/** The real instant of a cardroom wall-clock date and "HH:mm", allowing for daylight saving. Null if unparseable. */
export function cardroomInstant(date: string, time: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{1,2}):(\d{2})$/.exec(normalizeTime(time));
  if (!d || !t) return null;
  const wall = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  // Guess with the offset at that wall time read as UTC, then correct once with the offset at the guess.
  const guess = wall - cardroomOffsetMinutes(wall) * 60_000;
  return wall - cardroomOffsetMinutes(guess) * 60_000;
}

function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Real minutes between time in and time out of a session that started on `date`; a time out earlier than
 * time in is the next morning. Counts the actual hours, so the night clocks fall back is an hour longer and
 * the night they spring forward an hour shorter.
 */
export function sessionSpanMinutes(date: string, timeIn: string, timeOut: string): number | null {
  const start = normalizeTime(timeIn);
  const end = normalizeTime(timeOut);
  const startAt = cardroomInstant(date, start);
  if (startAt === null || !/^\d{2}:\d{2}$/.test(end)) return null;
  const endAt = cardroomInstant(end >= start ? date : nextDay(date), end);
  return endAt === null ? null : Math.round((endAt - startAt) / 60_000);
}

/** "19:00" → "7:00 PM"; anything unparseable is returned as-is (older rows typed by hand). */
export function formatClock(time: string): string {
  if (/[ap]\.?m\.?$/i.test(time.trim())) return time.trim(); // already 12-hour
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return time;
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 === 0 ? 12 : hours % 12}:${match[2]} ${suffix}`;
}

/** "7:00 PM – 12:15 AM", or "7:00 PM – now" while a session is open. */
export function formatTimeRange(timeIn: string, timeOut: string): string {
  if (!timeIn) return timeOut ? `– ${formatClock(timeOut)}` : "—";
  return `${formatClock(timeIn)} – ${timeOut ? formatClock(timeOut) : "now"}`;
}

/** 315 → "5h 15m", 480 → "8h", 20 → "20m". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "Oct 27 – 28, 2026", "Oct 30 – Nov 2, 2026", or one date when they match. */
export function formatDateRange(start: string, end: string): string {
  if (!end || start === end) return formatDateForDisplay(start);
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  if (a.getFullYear() !== b.getFullYear()) return `${formatDateForDisplay(start)} – ${formatDateForDisplay(end)}`;
  if (a.getMonth() === b.getMonth()) return `${format(a, "MMM d")} – ${format(b, "d, yyyy")}`;
  return `${format(a, "MMM d")} – ${format(b, "MMM d, yyyy")}`;
}

/** Minutes from a session's start (date + time in) until now, for "running 3h 20m". Null if unknown. */
export function minutesSince(date: string, timeIn: string, now = new Date()): number | null {
  const start = cardroomInstant(date, timeIn);
  if (start === null) return null;
  const minutes = Math.floor((now.getTime() - start) / 60_000);
  return minutes >= 0 ? minutes : null;
}
