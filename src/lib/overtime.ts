import { addDays, format, parseISO, startOfWeek } from "date-fns";
import type { TeamMember } from "@/lib/auth/types";
import { PAYROLL_START_DATE, sessionEmployee, sessionMinutes } from "@/lib/payroll";
import { isSessionOpen } from "@/lib/sessionHelpers";
import { d, type Decimal } from "@/lib/decimal";
import type { PayrollMember, Session } from "@/lib/validation/schemas";

/**
 * California overtime (Labor Code §510), applied to session hours:
 * - over 8h in a workday → 1.5×; over 12h → 2×
 * - regular hours past 40 in a workweek → 1.5×
 * - the 7th day worked in one workweek: the first 8h → 1.5×, beyond 8h → 2×
 * A workday is the calendar day a session started (sessions are dated by their start, see CLAUDE.md), and
 * the workweek runs Sunday–Saturday. These are estimates for planning pay, not a payroll or legal ruling.
 */
const DAY_LIMIT = 8 * 60;
const DOUBLE_LIMIT = 12 * 60;
const WEEK_LIMIT = 40 * 60;
export const WEEK_STARTS_ON = 0; // Sunday

export interface DayOvertime {
  date: string;
  worked: number;
  regular: number;
  overtime: number;
  doubleTime: number;
  seventhDay: boolean;
}

/** Minutes of one session (or day, or week) in each pay band. */
export interface PaySplit {
  regular: number;
  overtime: number;
  doubleTime: number;
}

export interface PayRates {
  base: Decimal;
  overtime: Decimal;
  doubleTime: Decimal;
}

/** A person's rates; blank overtime/double-time rates default to 1.5× and 2× base. Null until a base rate is set. */
export function ratesFor(personId: string, members: Pick<PayrollMember, "member_id" | "hourly_rate" | "overtime_rate" | "double_time_rate">[]): PayRates | null {
  const row = members.find((member) => member.member_id === personId && member.hourly_rate !== null);
  if (!row || row.hourly_rate === null) return null;
  const base = d(row.hourly_rate);
  return {
    base,
    overtime: row.overtime_rate === null ? base.times(1.5) : d(row.overtime_rate),
    doubleTime: row.double_time_rate === null ? base.times(2) : d(row.double_time_rate),
  };
}

export function payFor(split: PaySplit, rates: PayRates): Decimal {
  return rates.base
    .times(split.regular)
    .plus(rates.overtime.times(split.overtime))
    .plus(rates.doubleTime.times(split.doubleTime))
    .dividedBy(60)
    .toDecimalPlaces(2);
}

export interface WeekOvertime {
  weekStart: string;
  weekEnd: string;
  worked: number;
  regular: number;
  overtime: number;
  doubleTime: number;
  days: DayOvertime[];
  sessions: Session[];
  /** Every finished session in the week has been checked off on Payroll. */
  paid: boolean;
  /** Sessions still open this week, not yet counted. */
  inProgress: number;
  /** Finished sessions without usable times, so the week's hours are short by them. */
  missingTimes: number;
}

export interface PersonOvertime {
  person: TeamMember;
  weeks: WeekOvertime[];
  unpaidOvertime: number;
  unpaidDoubleTime: number;
  /** Each finished session's minutes by pay band (a day's later hours are its overtime). */
  sessionSplits: Map<string, PaySplit>;
}

/**
 * Hands a day's regular, overtime and double-time minutes to that day's sessions in time order, so the
 * hours that pushed the day (or week) over the limit land on the session where they were worked.
 */
function splitDayAcrossSessions(day: DayOvertime, sessions: { id: string; minutes: number }[], into: Map<string, PaySplit>) {
  const bands = { regular: day.regular, overtime: day.overtime, doubleTime: day.doubleTime };
  for (const session of sessions) {
    let left = session.minutes;
    const split: PaySplit = { regular: 0, overtime: 0, doubleTime: 0 };
    for (const band of ["regular", "overtime", "doubleTime"] as const) {
      const take = Math.min(left, bands[band]);
      split[band] += take;
      bands[band] -= take;
      left -= take;
    }
    into.set(session.id, split);
  }
}

/** Splits one workweek's daily minutes into regular, overtime, and double time. */
export function splitWeek(dailyMinutes: { date: string; minutes: number }[]): DayOvertime[] {
  const days = [...dailyMinutes].filter((day) => day.minutes > 0).sort((a, b) => a.date.localeCompare(b.date));
  const allSevenWorked = days.length === 7;
  let weekRegular = 0;
  return days.map((day, index) => {
    const seventhDay = allSevenWorked && index === 6;
    let regular: number;
    let overtime: number;
    let doubleTime: number;
    if (seventhDay) {
      regular = 0;
      overtime = Math.min(day.minutes, DAY_LIMIT);
      doubleTime = Math.max(day.minutes - DAY_LIMIT, 0);
    } else {
      regular = Math.min(day.minutes, DAY_LIMIT);
      overtime = Math.min(Math.max(day.minutes - DAY_LIMIT, 0), DOUBLE_LIMIT - DAY_LIMIT);
      doubleTime = Math.max(day.minutes - DOUBLE_LIMIT, 0);
    }
    // Weekly rule counts only regular hours, so daily overtime is never paid twice.
    const pastWeekLimit = Math.max(weekRegular + regular - WEEK_LIMIT, 0);
    regular -= pastWeekLimit;
    overtime += pastWeekLimit;
    weekRegular += regular;
    return { date: day.date, worked: day.minutes, regular, overtime, doubleTime, seventhDay };
  });
}

export function weekStartOf(date: string): string {
  return format(startOfWeek(parseISO(date), { weekStartsOn: WEEK_STARTS_ON }), "yyyy-MM-dd");
}

/** Overtime per person on payroll, by workweek, newest week first, from the payroll start date on. */
export function overtimeByPerson(sessions: Session[], people: TeamMember[]): PersonOvertime[] {
  return people.map((person) => {
    const mine = sessions.filter((session) => session.date >= PAYROLL_START_DATE && sessionEmployee(session, [person]));
    const sessionSplits = new Map<string, PaySplit>();
    const byWeek = new Map<string, Session[]>();
    for (const session of mine) {
      const key = weekStartOf(session.date);
      byWeek.set(key, [...(byWeek.get(key) ?? []), session]);
    }

    const weeks: WeekOvertime[] = [...byWeek.entries()]
      .map(([weekStart, weekSessions]) => {
        const finished = weekSessions.filter((session) => !isSessionOpen(session));
        const perDay = new Map<string, number>();
        let missingTimes = 0;
        for (const session of finished) {
          const minutes = sessionMinutes(session);
          if (minutes === null) missingTimes += 1;
          else perDay.set(session.date, (perDay.get(session.date) ?? 0) + minutes);
        }
        const days = splitWeek([...perDay].map(([date, minutes]) => ({ date, minutes })));
        for (const day of days) {
          const sameDay = finished
            .filter((session) => session.date === day.date && sessionMinutes(session) !== null)
            .sort((a, b) => a.time_in.localeCompare(b.time_in))
            .map((session) => ({ id: session.session_id, minutes: sessionMinutes(session)! }));
          splitDayAcrossSessions(day, sameDay, sessionSplits);
        }
        const sum = (key: "worked" | "regular" | "overtime" | "doubleTime") => days.reduce((total, day) => total + day[key], 0);
        return {
          weekStart,
          weekEnd: format(addDays(parseISO(weekStart), 6), "yyyy-MM-dd"),
          worked: sum("worked"),
          regular: sum("regular"),
          overtime: sum("overtime"),
          doubleTime: sum("doubleTime"),
          days,
          sessions: weekSessions,
          paid: finished.length > 0 && finished.every((session) => session.payroll_paid_at),
          inProgress: weekSessions.length - finished.length,
          missingTimes,
        };
      })
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart));

    const unpaid = weeks.filter((week) => !week.paid);
    return {
      person,
      weeks,
      unpaidOvertime: unpaid.reduce((total, week) => total + week.overtime, 0),
      unpaidDoubleTime: unpaid.reduce((total, week) => total + week.doubleTime, 0),
      sessionSplits,
    };
  });
}

/** Total pay for a set of sessions, or null when the person has no rate yet. */
export function payForSessions(sessionIds: string[], splits: Map<string, PaySplit>, rates: PayRates | null): Decimal | null {
  if (!rates) return null;
  return sessionIds.reduce((total, id) => {
    const split = splits.get(id);
    return split ? total.plus(payFor(split, rates)) : total;
  }, d(0));
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
