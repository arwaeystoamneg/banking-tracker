import type { TeamMember } from "@/lib/auth/types";
import { d } from "@/lib/decimal";
import { ratesFor, sessionPay } from "@/lib/overtime";
import { sessionEmployee, sessionMinutes } from "@/lib/payroll";
import { isSessionOpen } from "@/lib/sessionHelpers";
import { groupSessionsIntoTrips, sessionTrip } from "@/lib/trips";
import type { PayrollMember, Reimbursement, Session } from "@/lib/validation/schemas";

export const NO_TRIP = "Not in a trip";

export interface PnlLine {
  label: string;
  /** Finished sessions. */
  sessions: number;
  hours: number;
  /** Sum of buy-out − buy-in. */
  gross: number;
  /** Payroll people's pay for these sessions at their current rates. */
  pay: number;
  /** Finished payroll sessions whose pay couldn't be worked out (no rate set, or no usable times). */
  payUnknown: number;
  /** Reimbursements (owed or paid: either way it's money the team spent). */
  expenses: number;
  net: number;
}

type Members = Pick<PayrollMember, "member_id" | "hourly_rate" | "overtime_rate">[];

function emptyLine(label: string): PnlLine {
  return { label, sessions: 0, hours: 0, gross: 0, pay: 0, payUnknown: 0, expenses: 0, net: 0 };
}

/**
 * Which trip an expense belongs to: the trip of the session it was filed against, else the one trip whose
 * dates (first to last session) cover the day it was spent, else none. Expenses never put a session in a trip;
 * this only decides which trip's P&L carries the cost.
 */
export function expenseTrip(
  expense: Pick<Reimbursement, "date" | "session_id">,
  sessionsById: Map<string, Session>,
  spans: { name: string; start: string; end: string }[],
): string {
  const linked = expense.session_id ? sessionsById.get(expense.session_id) : undefined;
  if (linked) return sessionTrip(linked) || NO_TRIP;
  const covering = spans.filter((span) => expense.date >= span.start && expense.date <= span.end);
  return covering.length === 1 ? covering[0].name : NO_TRIP;
}

/**
 * P&L per trip, most recent trip first and "Not in a trip" last, plus the total: gross results, then Damon's
 * (any payroll person's) pay, then expenses, then what's left. Pass sessions and expenses already limited to
 * the dates being looked at.
 */
export function pnlByTrip(input: {
  sessions: Session[];
  reimbursements: Pick<Reimbursement, "date" | "session_id" | "amount">[];
  people: TeamMember[];
  members: Members;
}): { rows: PnlLine[]; total: PnlLine } {
  const trips = groupSessionsIntoTrips(input.sessions);
  const lines = new Map<string, PnlLine>(trips.map((trip) => [trip.name, emptyLine(trip.name)]));
  lines.set(NO_TRIP, emptyLine(NO_TRIP));
  const sessionsById = new Map(input.sessions.map((session) => [session.session_id, session]));
  const spans = trips.map((trip) => ({ name: trip.name, start: trip.startDate, end: trip.endDate }));
  const tripOf = (session: Session) => {
    const name = sessionTrip(session);
    return trips.find((trip) => trip.name.toLowerCase() === name.toLowerCase())?.name ?? NO_TRIP;
  };

  for (const session of input.sessions) {
    if (isSessionOpen(session) || session.buy_out === null || session.buy_out === undefined) continue;
    const line = lines.get(tripOf(session))!;
    line.sessions += 1;
    line.hours += (sessionMinutes(session) ?? 0) / 60;
    line.gross = d(line.gross).plus(session.buy_out).minus(session.buy_in).toNumber();
    const person = sessionEmployee(session, input.people);
    if (person) {
      const pay = sessionPay(session, ratesFor(person.id, input.members));
      if (pay) line.pay = d(line.pay).plus(pay).toNumber();
      else line.payUnknown += 1;
    }
  }
  for (const expense of input.reimbursements) {
    const line = lines.get(expenseTrip(expense, sessionsById, spans))!;
    line.expenses = d(line.expenses).plus(expense.amount).toNumber();
  }

  const total = emptyLine("Total");
  for (const line of lines.values()) {
    line.net = d(line.gross).minus(line.pay).minus(line.expenses).toNumber();
    total.sessions += line.sessions;
    total.hours += line.hours;
    total.gross = d(total.gross).plus(line.gross).toNumber();
    total.pay = d(total.pay).plus(line.pay).toNumber();
    total.payUnknown += line.payUnknown;
    total.expenses = d(total.expenses).plus(line.expenses).toNumber();
  }
  total.net = d(total.gross).minus(total.pay).minus(total.expenses).toNumber();

  const rows = [...trips.map((trip) => lines.get(trip.name)!)];
  const loose = lines.get(NO_TRIP)!;
  if (loose.sessions > 0 || loose.expenses > 0) rows.push(loose);
  return { rows, total };
}

/**
 * Expenses filed against one of these sessions come off that session's result (for the per-player cards);
 * the rest can't be pinned on a session and are returned as dated amounts (for the running-total chart).
 */
export function applyExpenses(
  sessions: Session[],
  reimbursements: Pick<Reimbursement, "date" | "session_id" | "amount">[],
): { sessions: Session[]; unlinked: { date: string; amount: number }[] } {
  const bySession = new Map<string, number>();
  // Only finished sessions have a result to take it from; a cost on an open session counts by its date.
  const ids = new Set(
    sessions
      .filter((session) => !isSessionOpen(session) && session.buy_out !== null && session.buy_out !== undefined)
      .map((session) => session.session_id),
  );
  const unlinked: { date: string; amount: number }[] = [];
  for (const expense of reimbursements) {
    if (expense.session_id && ids.has(expense.session_id)) {
      bySession.set(expense.session_id, d(bySession.get(expense.session_id) ?? 0).plus(expense.amount).toNumber());
    } else {
      unlinked.push({ date: expense.date, amount: expense.amount });
    }
  }
  return {
    sessions: sessions.map((session) => {
      const cost = bySession.get(session.session_id);
      return cost ? { ...session, buy_out: d(session.buy_out!).minus(cost).toNumber() } : session;
    }),
    unlinked,
  };
}
