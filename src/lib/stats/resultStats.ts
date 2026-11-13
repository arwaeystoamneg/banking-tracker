import { Decimal, d } from "@/lib/decimal";
import { sessionMinutes } from "@/lib/payroll";
import { canonicalPerson, normalizePersonKey, sessionCardrooms } from "@/lib/names";
import { byPlayTimeNewestFirst, isSessionOpen, sessionPlayerName } from "@/lib/sessionHelpers";
import type { Session } from "@/lib/validation/schemas";

/** How a set of finished sessions went. Open sessions are counted but never enter the money figures. */
export interface ResultStats {
  sessionCount: number;
  completedCount: number;
  winningCount: number;
  net: Decimal;
  /** Played minutes across finished sessions with readable times. */
  minutes: number;
  /** Net per hour over the sessions that have times; null with no timed sessions. */
  hourly: Decimal | null;
  /**
   * Standard deviation per hour of play: each session's miss from the hourly rate, weighted by its length
   * (σ² = Σ (result − hourly·hours)² / hours ÷ sessions). Null with fewer than two timed sessions.
   */
  sdPerHour: number | null;
  /** 95% range for the true hourly given the hours played (hourly ± 1.96·σ/√hours); null without σ. */
  hourlyRange: [number, number] | null;
  best: Session | null;
  worst: Session | null;
  /** Deepest fall from a running high, session by session in play order (0 if it never fell). */
  maxDrawdown: Decimal;
  firstDate: string;
  lastDate: string;
}

export interface RoomStats extends ResultStats {
  room: string;
}

function result(session: Session): Decimal {
  return d(session.buy_out ?? 0).minus(session.buy_in);
}

export function computeResultStats(sessions: Session[]): ResultStats {
  const finished = sessions.filter((s) => !isSessionOpen(s) && s.buy_out !== null).sort(byPlayTimeNewestFirst).reverse();
  let net = d(0);
  let timedNet = d(0);
  let minutes = 0;
  let winningCount = 0;
  let best: Session | null = null;
  let worst: Session | null = null;
  let high = d(0);
  let maxDrawdown = d(0);
  const timed: { result: number; hours: number }[] = [];

  for (const session of finished) {
    const r = result(session);
    net = net.plus(r);
    if (r.isPositive()) winningCount += 1;
    if (!best || r.greaterThan(result(best))) best = session;
    if (!worst || r.lessThan(result(worst))) worst = session;
    const played = sessionMinutes(session);
    if (played !== null && played > 0) {
      minutes += played;
      timedNet = timedNet.plus(r);
      timed.push({ result: r.toNumber(), hours: played / 60 });
    }
    if (net.greaterThan(high)) high = net;
    if (high.minus(net).greaterThan(maxDrawdown)) maxDrawdown = high.minus(net);
  }

  const hours = minutes / 60;
  const rate = hours > 0 ? timedNet.toNumber() / hours : 0;
  const sdPerHour =
    timed.length >= 2 ? Math.sqrt(timed.reduce((sum, t) => sum + (t.result - rate * t.hours) ** 2 / t.hours, 0) / timed.length) : null;
  const margin = sdPerHour === null ? null : (1.96 * sdPerHour) / Math.sqrt(hours);

  const dates = sessions.map((s) => s.date).sort();
  return {
    sessionCount: sessions.length,
    completedCount: finished.length,
    winningCount,
    net,
    minutes,
    hourly: minutes > 0 ? timedNet.dividedBy(minutes).times(60) : null,
    sdPerHour,
    hourlyRange: margin === null ? null : [rate - margin, rate + margin],
    best,
    worst,
    maxDrawdown,
    firstDate: dates[0] ?? "",
    lastDate: dates[dates.length - 1] ?? "",
  };
}

/** The same figures split by cardroom, busiest room first. A night across rooms counts toward "Several rooms". */
export function statsByRoom(sessions: Session[]): RoomStats[] {
  const groups = new Map<string, Session[]>();
  for (const session of sessions) {
    const rooms = sessionCardrooms(session.casino);
    const room = rooms.length === 0 ? "No room" : rooms.length === 1 ? rooms[0] : "Several rooms";
    groups.set(room, [...(groups.get(room) ?? []), session]);
  }
  return [...groups.entries()]
    .map(([room, group]) => ({ room, ...computeResultStats(group) }))
    .sort((a, b) => b.minutes - a.minutes || b.completedCount - a.completedCount);
}

/** Sessions per player, credited to who played with name variants merged, alphabetical. */
export function sessionsByPlayer(sessions: Session[]): { label: string; sessions: Session[] }[] {
  const groups = new Map<string, { label: string; sessions: Session[] }>();
  for (const session of sessions) {
    const name = sessionPlayerName(session);
    const key = normalizePersonKey(name);
    if (!key) continue;
    const group = groups.get(key) ?? { label: canonicalPerson(name), sessions: [] };
    group.sessions.push(session);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}
