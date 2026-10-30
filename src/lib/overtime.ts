import type { TeamMember } from "@/lib/auth/types";
import { PAYROLL_START_DATE, sessionEmployee, sessionMinutes } from "@/lib/payroll";
import { isSessionOpen } from "@/lib/sessionHelpers";
import { d, type Decimal } from "@/lib/decimal";
import type { PayrollMember, Session } from "@/lib/validation/schemas";

/**
 * Overtime is an approval, not a calculation: the player requests it for a session, Ray or admin approves it,
 * and only then does that whole session pay at the person's overtime rate instead of their base rate.
 */
export interface PayRates {
  base: Decimal;
  overtime: Decimal;
}

/** A person's rates; a blank overtime rate means 1.5× base. Null until a base rate is set. */
export function ratesFor(
  personId: string,
  members: Pick<PayrollMember, "member_id" | "hourly_rate" | "overtime_rate">[],
): PayRates | null {
  const row = members.find((member) => member.member_id === personId && member.hourly_rate !== null);
  if (!row || row.hourly_rate === null) return null;
  const base = d(row.hourly_rate);
  return { base, overtime: row.overtime_rate === null ? base.times(1.5) : d(row.overtime_rate) };
}

/** What one finished session pays, or null without a rate or usable times. */
export function sessionPay(session: Pick<Session, "time_in" | "time_out" | "overtime_status">, rates: PayRates | null): Decimal | null {
  const minutes = sessionMinutes(session);
  if (!rates || minutes === null) return null;
  return (session.overtime_status === "approved" ? rates.overtime : rates.base).times(minutes).dividedBy(60).toDecimalPlaces(2);
}

export function totalPay(sessions: Pick<Session, "time_in" | "time_out" | "overtime_status">[], rates: PayRates | null): Decimal | null {
  if (!rates) return null;
  return sessions.reduce((total, session) => total.plus(sessionPay(session, rates) ?? 0), d(0));
}

export interface PersonOvertime {
  person: TeamMember;
  /** Asked for, waiting on Ray or admin. */
  requested: Session[];
  /** Approved and not yet paid. */
  unpaid: Session[];
  paid: Session[];
  unpaidMinutes: number;
}

/** Each person's overtime requests and approved overtime since payroll tracking started, newest first. */
export function overtimeByPerson(sessions: Session[], people: TeamMember[]): PersonOvertime[] {
  const sorted = [...sessions].sort((a, b) => (a.date === b.date ? b.time_in.localeCompare(a.time_in) : b.date.localeCompare(a.date)));
  return people.map((person) => {
    const mine = sorted.filter(
      (session) => session.date >= PAYROLL_START_DATE && !isSessionOpen(session) && sessionEmployee(session, [person]),
    );
    const approved = mine.filter((session) => session.overtime_status === "approved");
    const unpaid = approved.filter((session) => !session.payroll_paid_at);
    return {
      person,
      requested: mine.filter((session) => session.overtime_status === "requested" && !session.payroll_paid_at),
      unpaid,
      paid: approved.filter((session) => session.payroll_paid_at),
      unpaidMinutes: unpaid.reduce((total, session) => total + (sessionMinutes(session) ?? 0), 0),
    };
  });
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
