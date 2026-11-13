import { Decimal, d } from "@/lib/decimal";
import { sessionCardrooms } from "@/lib/names";
import type { Session } from "@/lib/validation/schemas";
import { byPlayTimeNewestFirst, isSessionOpen } from "@/lib/sessionHelpers";

/**
 * A "trip" is a set of sessions Ray or admin put together under one name (the session's `trip` field).
 * Nothing is inferred from dates: a session with no trip name stands alone.
 */
export interface Trip {
  id: string;
  name: string;
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

function durationMinutes(timeIn: string, timeOut: string): number {
  const [inH, inM] = timeIn.split(":").map(Number);
  const [outH, outM] = timeOut.split(":").map(Number);
  if (![inH, inM, outH, outM].every(Number.isFinite)) return 0;
  const elapsed = outH * 60 + outM - (inH * 60 + inM);
  return elapsed < 0 ? elapsed + 24 * 60 : elapsed;
}

function summarize(name: string, sessions: Session[]): Trip {
  const casinos: string[] = [];
  const seenCasinos = new Set<string>();
  let netCash = d(0);
  let totalBuyIn = d(0);
  let completedCount = 0;
  let totalMinutes = 0;

  for (const s of sessions) {
    for (const name of sessionCardrooms(s.casino)) {
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
    id: `trip_${name}`,
    name,
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

/** The trip name a session was put in, trimmed; "" when it isn't in one. */
export function sessionTrip(session: Pick<Session, "trip">): string {
  return (session.trip ?? "").trim();
}

/**
 * Groups sessions by their trip name, most recent trip first, with each trip's sessions newest-first.
 * Sessions without a trip are left out; the list shows them on their own.
 */
export function groupSessionsIntoTrips(sessions: Session[]): Trip[] {
  const byName = new Map<string, Session[]>();
  for (const s of sessions) {
    const name = sessionTrip(s);
    if (!name) continue;
    const key = name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), s]);
  }
  return [...byName.values()]
    .map((group) => {
      const sorted = [...group].sort(byPlayTimeNewestFirst);
      // Rooms listed in the order they were visited; the name as most recently typed wins.
      const trip = summarize(sessionTrip(sorted[0]), [...sorted].reverse());
      trip.sessions = sorted;
      return trip;
    })
    .sort((a, b) => byPlayTimeNewestFirst(a.sessions[0], b.sessions[0]) || a.name.localeCompare(b.name));
}

/** Trip names in use, most recent first, for picking one. */
export function tripNames(sessions: Session[]): string[] {
  return groupSessionsIntoTrips(sessions).map((trip) => trip.name);
}

/** Where a trip's own stats page lives. */
export function tripHref(name: string): string {
  return `/trips/${encodeURIComponent(name)}`;
}
