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
   * (σ² = Σ (result − hourly·hours)² / hours ÷ (sessions − 1)). With a prior, a group with few sessions leans on
   * what other sessions at its stakes swing (see priorVariance); without one it's the group's own figure.
   */
  sdPerHour: number | null;
  /** True when sdPerHour leans mostly on other sessions' σ because this group has few of its own. */
  sdIsRough: boolean;
  /**
   * 95% range for the true hourly given the hours played (hourly ± t·σ/√hours, t for σ's degrees of freedom). Null without σ or under
   * MIN_RANGE_SESSIONS timed sessions, where one big night decides the whole range.
   */
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

/**
 * How many sessions' worth of weight the pooled σ gets. A handful of sessions that happen to land close together
 * says little about the swing (three similar losses gave Oaks σ ≈ $92/hr), so a small group's σ is pulled toward
 * what similar sessions elsewhere swing until it has enough sessions to speak for itself.
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

/** Two-sided 95% Student-t multiplier (Cornish–Fisher; within 0.3% of the table from 3 degrees of freedom up). */
export function t95(df: number): number {
  if (df <= 1) return 12.706;
  if (df === 2) return 4.303;
  const z = 1.959964;
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2) + (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * df ** 3);
}

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
  const group = timedSessions(finished);
  const own = hourVariance(group);
  const pooled = prior ? priorVariance(prior, group) : null;
  // Pooling as if the prior were PRIOR_SESSIONS more sessions: σ² = ((n − 1)·s² + k·σ₀²) / (n − 1 + k).
  const ownDf = own === null ? 0 : group.length - 1;
  const df = ownDf + (pooled === null ? 0 : PRIOR_SESSIONS);
  const variance = df === 0 ? null : ((own ?? 0) * ownDf + (pooled ?? 0) * (pooled === null ? 0 : PRIOR_SESSIONS)) / df;
  const sdPerHour = variance === null ? null : Math.sqrt(variance);
  const margin = sdPerHour === null || hours <= 0 || timed.length < MIN_RANGE_SESSIONS ? null : (t95(df) * sdPerHour) / Math.sqrt(hours);

  const dates = sessions.map((s) => s.date).sort();
  return {
    sessionCount: sessions.length,
    completedCount: finished.length,
    winningCount,
    net,
    minutes,
    hourly: minutes > 0 ? timedNet.dividedBy(minutes).times(60) : null,
    sdPerHour,
    sdIsRough: pooled !== null && timed.length < PRIOR_SESSIONS,
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
