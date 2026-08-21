import { Decimal, d } from "@/lib/decimal";
import { canonicalCasino } from "@/lib/names";
import type { Session } from "@/lib/validation/schemas";
import { isSessionOpen } from "@/lib/sessionHelpers";

/**
 * A "trip" is one visit out to play — a contiguous run of sessions with no gap larger than
 * TRIP_MAX_GAP_DAYS between adjacent dates. This is derived purely from the `date` field (no schema
 * column, no data entry): a weekend of sessions collapses into one trip, and a return a week later
 * starts a new one. Casinos are not used to split — a single trip can hit several rooms.
 */
export const TRIP_MAX_GAP_DAYS = 1;

export interface Trip {
  id: string;
  startDate: string;
  endDate: string;
  sessions: Session[];
  casinos: string[];
  sessionCount: number;
  completedCount: number;
  openCount: number;
  /** Sum of (buy_out - buy_in) over completed sessions. */
  netCash: Decimal;
  totalBuyIn: Decimal;
  totalMinutes: number;
}

function daysBetween(earlier: string, later: string): number {
  const a = new Date(`${earlier}T00:00:00`).getTime();
  const b = new Date(`${later}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function durationMinutes(timeIn: string, timeOut: string): number {
  const [inH, inM] = timeIn.split(":").map(Number);
  const [outH, outM] = timeOut.split(":").map(Number);
  if (![inH, inM, outH, outM].every(Number.isFinite)) return 0;
  const elapsed = outH * 60 + outM - (inH * 60 + inM);
  return elapsed < 0 ? elapsed + 24 * 60 : elapsed;
}

function summarize(sessions: Session[]): Trip {
  const casinos: string[] = [];
  const seenCasinos = new Set<string>();
  let netCash = d(0);
  let totalBuyIn = d(0);
  let completedCount = 0;
  let totalMinutes = 0;

  for (const s of sessions) {
    if (s.casino.trim()) {
      const name = canonicalCasino(s.casino);
      if (!seenCasinos.has(name)) {
        seenCasinos.add(name);
        casinos.push(name);
      }
    }
    if (!isSessionOpen(s) && s.buy_out !== null) {
      completedCount += 1;
      totalBuyIn = totalBuyIn.plus(s.buy_in);
      netCash = netCash.plus(d(s.buy_out).minus(s.buy_in));
      if (s.time_in && s.time_out) totalMinutes += durationMinutes(s.time_in, s.time_out);
    }
  }

  const dates = sessions.map((s) => s.date).sort();
  return {
    id: `trip_${dates[0]}_${dates[dates.length - 1]}`,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    sessions,
    casinos,
    sessionCount: sessions.length,
    completedCount,
    openCount: sessions.length - completedCount,
    netCash,
    totalBuyIn,
    totalMinutes,
  };
}

/**
 * Groups sessions into trips by date proximity and returns them most-recent-first, with the sessions
 * inside each trip also most-recent-first. Sessions with the same date always share a trip.
 */
export function groupSessionsIntoTrips(sessions: Session[], maxGapDays: number = TRIP_MAX_GAP_DAYS): Trip[] {
  if (sessions.length === 0) return [];

  const byDateAsc = [...sessions].sort((a, b) =>
    a.date === b.date ? a.logged_at.localeCompare(b.logged_at) : a.date.localeCompare(b.date),
  );

  const groups: Session[][] = [];
  let current: Session[] = [];
  for (const s of byDateAsc) {
    if (current.length === 0) {
      current = [s];
      continue;
    }
    const prev = current[current.length - 1];
    if (daysBetween(prev.date, s.date) <= maxGapDays) {
      current.push(s);
    } else {
      groups.push(current);
      current = [s];
    }
  }
  if (current.length > 0) groups.push(current);

  return groups
    .map((group) => {
      const trip = summarize(group);
      // Present sessions newest-first within the trip.
      trip.sessions = [...group].reverse();
      return trip;
    })
    .reverse();
}
