import { Decimal, d } from "@/lib/decimal";
import { t95 } from "@/lib/math/core";
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
  /**
   * Days with timed play, one per person per session date (the day a session started). Two people playing the
   * same day are two days, so a trip's hours per day is per person, not the group's combined total.
   */
  daysPlayed: number;
  /** Net per hour over the sessions that have times; null with no timed sessions. */
  hourly: Decimal | null;
  /**
   * Standard deviation per hour of play: each session's miss from the hourly rate, weighted by its length
   * (σ² = Σ (result − hourly·hours)² / hours ÷ (sessions − 1)). With a prior, a group with few sessions leans on
   * what other sessions at its stakes swing (see priorVariance); without one it's the group's own figure.
   */
  sdPerHour: number | null;
  /** True when sdPerHour borrows from other sessions' σ because this group has 10 or fewer of its own. */
  sdIsRough: boolean;
  /**
   * 95% range for the true hourly given the hours played (hourly ± t·σ/√hours, t with the group's own sessions − 1
   * degrees of freedom — borrowed swing doesn't make a small group's hourly any surer). Null without σ or under
   * MIN_RANGE_SESSIONS timed sessions, where one big night decides the whole range.
   */
  hourlyRange: [number, number] | null;
  /**
   * σ per hour of the bankroll *during* sessions, from each session's lowest and highest stack: for a random walk
   * E[(high − low)²] = 4·ln 2·σ²·hours. Session ends alone understate it when nights are played back to even.
   * Null until a session has both recorded; the stacks are usually estimates, which squaring forgives.
   */
  inSessionSdPerHour: number | null;
  /** Sessions with both a lowest and a highest stack. */
  swingSessions: number;
  /** Furthest any session fell below its buy-in, from its lowest stack (0 if none recorded below buy-in). */
  deepestDip: number;
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

/**
 * How many sessions a group needs before its σ is its own. A handful of sessions that happen to land close together
 * says little about the swing (three similar losses gave Oaks σ ≈ $92/hr), so a smaller group is topped up to this
 * many sessions' worth with what similar-stakes sessions elsewhere swing. The borrowed share shrinks with every
 * session and is gone at 11, so a well-played room or a player's total shows its own swing.
 */
const PRIOR_SESSIONS = 10;
const MIN_RANGE_SESSIONS = 3;
/** A stake tier needs this many sessions elsewhere before its own σ is trusted over everyone's. */
const MIN_TIER_SESSIONS = 5;

interface Timed {
  id: string;
  result: number;
  hours: number;
  tier: number;
}

/**
 * Bigger bankrolls swing far harder, even per dollar of chips (≤$10k ≈ $1.1k/hr, $15k+ ≈ $5k/hr on the live data),
 * so the pooled σ comes from sessions at similar stakes.
 */
function stakeTier(buyIn: number): number {
  return buyIn <= 10000 ? 0 : buyIn <= 15000 ? 1 : 2;
}

/** Hours-weighted variance per hour around the group's own hourly, n − 1 since that hourly is estimated from it. */
function hourVariance(timed: Timed[]): number | null {
  if (timed.length < 2) return null;
  const hours = timed.reduce((sum, t) => sum + t.hours, 0);
  const rate = timed.reduce((sum, t) => sum + t.result, 0) / hours;
  return timed.reduce((sum, t) => sum + (t.result - rate * t.hours) ** 2 / t.hours, 0) / (timed.length - 1);
}

function timedSessions(sessions: Session[]): Timed[] {
  return sessions.flatMap((session) => {
    const played = sessionMinutes(session);
    if (isSessionOpen(session) || session.buy_out === null || played === null || played <= 0) return [];
    return [{ id: session.session_id, result: result(session).toNumber(), hours: played / 60, tier: stakeTier(session.buy_in) }];
  });
}

/** Every timed session, for pulling small groups toward what similar sessions swing (pass to computeResultStats). */
export interface SdPrior {
  timed: Timed[];
}

export function sdPrior(sessions: Session[]): SdPrior {
  return { timed: timedSessions(sessions) };
}

/**
 * The σ² a group is pulled toward: each of its sessions gets the variance of other sessions at the same stake tier
 * (everyone's if that tier is thin), averaged by hours. The group's own sessions are left out so they aren't
 * counted twice. Null when nothing else is left to compare with.
 */
function priorVariance(prior: SdPrior, group: Timed[]): number | null {
  const mine = new Set(group.map((t) => t.id));
  const rest = prior.timed.filter((t) => !mine.has(t.id));
  const overall = hourVariance(rest);
  if (overall === null || group.length === 0) return null;
  const byTier = [0, 1, 2].map((tier) => {
    const at = rest.filter((t) => t.tier === tier);
    return at.length >= MIN_TIER_SESSIONS ? (hourVariance(at) ?? overall) : overall;
  });
  const hours = group.reduce((sum, t) => sum + t.hours, 0);
  return group.reduce((sum, t) => sum + byTier[t.tier] * t.hours, 0) / hours;
}

export { t95 };

export function computeResultStats(sessions: Session[], prior?: SdPrior): ResultStats {
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
  const playDays = new Set<string>();

  for (const session of finished) {
    const r = result(session);
    net = net.plus(r);
    if (r.isPositive()) winningCount += 1;
    if (!best || r.greaterThan(result(best))) best = session;
    if (!worst || r.lessThan(result(worst))) worst = session;
    const played = sessionMinutes(session);
    if (played !== null && played > 0) {
      minutes += played;
      playDays.add(`${normalizePersonKey(sessionPlayerName(session))}|${session.date}`);
      timedNet = timedNet.plus(r);
      timed.push({ result: r.toNumber(), hours: played / 60 });
    }
    if (net.greaterThan(high)) high = net;
    if (high.minus(net).greaterThan(maxDrawdown)) maxDrawdown = high.minus(net);
  }

  const hours = minutes / 60;
  const rate = hours > 0 ? timedNet.toNumber() / hours : 0;
  const group = timedSessions(finished);
  const own = hourVariance(group);
  const pooled = prior ? priorVariance(prior, group) : null;
  // The prior only tops a small group up to PRIOR_SESSIONS sessions' worth: k = max(0, 10 − (n − 1)), and
  // σ² = ((n − 1)·s² + k·σ₀²) / (n − 1 + k). Eleven or more sessions stand on their own swing alone.
  const ownDf = own === null ? 0 : group.length - 1;
  const priorWeight = pooled === null ? 0 : Math.max(0, PRIOR_SESSIONS - ownDf);
  const weight = ownDf + priorWeight;
  const variance = weight === 0 ? null : ((own ?? 0) * ownDf + (pooled ?? 0) * priorWeight) / weight;
  const sdPerHour = variance === null ? null : Math.sqrt(variance);
  // t on the group's own sessions (n − 1), not the borrowed ones: the hourly range is about these sessions.
  const margin =
    sdPerHour === null || hours <= 0 || timed.length < MIN_RANGE_SESSIONS || ownDf < 1 ? null : (t95(ownDf) * sdPerHour) / Math.sqrt(hours);

  let rangeSquares = 0;
  let rangeHours = 0;
  let swingSessions = 0;
  let deepestDip = 0;
  for (const session of finished) {
    const ends = [session.buy_in, session.buy_out ?? session.buy_in];
    if (session.low_stack !== null) deepestDip = Math.max(deepestDip, session.buy_in - Math.min(session.low_stack, ...ends));
    const played = sessionMinutes(session);
    if (session.low_stack === null || session.high_stack === null || played === null || played <= 0) continue;
    const range = Math.max(session.high_stack, ...ends) - Math.min(session.low_stack, ...ends);
    rangeSquares += range ** 2;
    rangeHours += played / 60;
    swingSessions += 1;
  }
  const inSessionSdPerHour = swingSessions > 0 ? Math.sqrt(rangeSquares / (4 * Math.LN2 * rangeHours)) : null;

  const dates = sessions.map((s) => s.date).sort();
  return {
    inSessionSdPerHour,
    swingSessions,
    deepestDip,
    sessionCount: sessions.length,
    completedCount: finished.length,
    winningCount,
    net,
    minutes,
    daysPlayed: playDays.size,
    hourly: minutes > 0 ? timedNet.dividedBy(minutes).times(60) : null,
    sdPerHour,
    sdIsRough: priorWeight > 0,
    hourlyRange: margin === null ? null : [rate - margin, rate + margin],
    best,
    worst,
    maxDrawdown,
    firstDate: dates[0] ?? "",
    lastDate: dates[dates.length - 1] ?? "",
  };
}

/** The same figures split by cardroom, busiest room first. A night across rooms counts toward "Several rooms". */
export function statsByRoom(sessions: Session[], prior?: SdPrior): RoomStats[] {
  const groups = new Map<string, Session[]>();
  for (const session of sessions) {
    const rooms = sessionCardrooms(session.casino);
    const room = rooms.length === 0 ? "No room" : rooms.length === 1 ? rooms[0] : "Several rooms";
    groups.set(room, [...(groups.get(room) ?? []), session]);
  }
  return [...groups.entries()]
    .map(([room, group]) => ({ room, ...computeResultStats(group, prior) }))
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

export interface PnlPoint {
  date: string;
  /** Net of the finished sessions that started that day. */
  day: number;
  /** Running net through the end of that day. */
  total: number;
  sessions: number;
}

/** Running net, one point per session date, oldest first. Open sessions have no result yet and are left out. */
export function cumulativePnl(sessions: Session[]): PnlPoint[] {
  const byDate = new Map<string, { day: Decimal; sessions: number }>();
  for (const session of sessions) {
    if (isSessionOpen(session) || !session.date) continue;
    const row = byDate.get(session.date) ?? { day: d(0), sessions: 0 };
    byDate.set(session.date, { day: row.day.plus(result(session)), sessions: row.sessions + 1 });
  }
  let total = d(0);
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, row]) => {
      total = total.plus(row.day);
      return { date, day: row.day.toNumber(), total: total.toNumber(), sessions: row.sessions };
    });
}
