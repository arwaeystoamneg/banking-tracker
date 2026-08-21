import { Decimal, d } from "@/lib/decimal";
import type { Session } from "@/lib/validation/schemas";

export interface PersonStats {
  name: string;
  sessionCount: number;
  completedCount: number;
  winningCount: number;
  totalBuyIn: Decimal;
  totalBuyOut: Decimal;
  netCash: Decimal;
  averageNet: Decimal | null;
  totalMinutes: number;
  firstDate: string;
  lastDate: string;
}

function durationMinutes(timeIn: string, timeOut: string): number {
  const [inHour, inMinute] = timeIn.split(":").map(Number);
  const [outHour, outMinute] = timeOut.split(":").map(Number);
  if (![inHour, inMinute, outHour, outMinute].every(Number.isFinite)) return 0;

  const start = inHour * 60 + inMinute;
  const end = outHour * 60 + outMinute;
  const elapsed = end - start;
  return elapsed < 0 ? elapsed + 24 * 60 : elapsed;
}

export function computePersonStats(sessions: Session[]): PersonStats[] {
  const byPerson = new Map<string, PersonStats>();

  for (const session of sessions) {
    const name = session.logged_by.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    const current = byPerson.get(key) ?? {
      name,
      sessionCount: 0,
      completedCount: 0,
      winningCount: 0,
      totalBuyIn: d(0),
      totalBuyOut: d(0),
      netCash: d(0),
      averageNet: null,
      totalMinutes: 0,
      firstDate: session.date,
      lastDate: session.date,
    };

    current.sessionCount += 1;
    if (session.date < current.firstDate) current.firstDate = session.date;
    if (session.date > current.lastDate) current.lastDate = session.date;

    if (session.buy_out !== null) {
      const result = d(session.buy_out).minus(session.buy_in);
      current.completedCount += 1;
      current.totalBuyIn = current.totalBuyIn.plus(session.buy_in);
      current.totalBuyOut = current.totalBuyOut.plus(session.buy_out);
      current.netCash = current.netCash.plus(result);
      if (result.isPositive()) current.winningCount += 1;
      if (session.time_in && session.time_out) {
        current.totalMinutes += durationMinutes(session.time_in, session.time_out);
      }
    }

    byPerson.set(key, current);
  }

  return Array.from(byPerson.values())
    .map((stats) => ({
      ...stats,
      averageNet: stats.completedCount === 0 ? null : stats.netCash.dividedBy(stats.completedCount),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
