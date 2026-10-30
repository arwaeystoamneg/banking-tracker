import { sameIdentity } from "@/lib/auth/permissions";
import type { AuthUser, TeamMember } from "@/lib/auth/types";
import { d, type Decimal } from "@/lib/decimal";
import { isSessionOpen, sessionPlayerName } from "@/lib/sessionHelpers";
import type { PayrollMember, Session } from "@/lib/validation/schemas";

/**
 * Payroll tracking starts here. Everything an employee played before this date was paid outside the
 * app, so those sessions never show as owed.
 */
export const PAYROLL_START_DATE = "2026-10-01";

/** Besides admin, only these accounts (matched by id or name) may check off a session as paid. */
const PAYROLL_APPROVERS = ["ray"];

export function canMarkPayrollPaid(user: AuthUser): boolean {
  if (user.role === "admin") return true;
  if (user.role !== "individual") return false;
  return PAYROLL_APPROVERS.some((approver) => sameIdentity(approver, user));
}

/** Partners and admin see everyone's payroll; employees see only their own. */
export function canSeeAllPayroll(user: AuthUser): boolean {
  return user.role === "admin" || user.role === "individual";
}

/**
 * Everyone on payroll: employee accounts always, plus anyone (an individual included) Ray or admin added
 * on the Payroll page. Added people who no longer have an account drop off.
 */
export function payrollPeople(team: TeamMember[], members: Pick<PayrollMember, "member_id">[]): TeamMember[] {
  const added = new Set(members.map((member) => member.member_id.trim().toLowerCase()));
  return team.filter((person) => person.role === "employee" || added.has(person.id));
}

/** The employee who played this session, matched by account id, or by name on rows logged before player_id. */
export function sessionEmployee(session: Session, employees: TeamMember[]): TeamMember | undefined {
  const id = session.player_id.trim().toLowerCase();
  if (id) return employees.find((employee) => employee.id === id);
  const name = sessionPlayerName(session).toLowerCase();
  return name ? employees.find((employee) => employee.name.trim().toLowerCase() === name) : undefined;
}

export type PayrollState = "before_tracking" | "in_progress" | "unpaid" | "paid";

export function payrollState(session: Session): PayrollState {
  if (session.date < PAYROLL_START_DATE) return "before_tracking";
  if (session.payroll_paid_at) return "paid";
  if (isSessionOpen(session)) return "in_progress";
  return "unpaid";
}

function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Whole minutes between time in and time out; a time out earlier than time in ran past midnight. */
export function sessionMinutes(session: Pick<Session, "time_in" | "time_out">): number | null {
  const start = minutesOf(session.time_in);
  const end = minutesOf(session.time_out);
  if (start === null || end === null) return null;
  return end >= start ? end - start : end + 24 * 60 - start;
}

/** Hours between time in and time out; a time out earlier than time in ran past midnight. */
export function sessionHours(session: Pick<Session, "time_in" | "time_out">): Decimal | null {
  const minutes = sessionMinutes(session);
  return minutes === null ? null : d(minutes).dividedBy(60);
}

export function formatHours(hours: Decimal | null): string {
  if (hours === null) return "—";
  const whole = hours.floor();
  const minutes = hours.minus(whole).times(60).round().toNumber();
  return minutes === 0 ? `${whole.toString()}h` : `${whole.toString()}h ${minutes}m`;
}

export interface EmployeePayroll {
  employee: TeamMember;
  unpaid: Session[];
  inProgress: Session[];
  paid: Session[];
  unpaidHours: Decimal;
  /** Unpaid sessions whose times can't be turned into hours, so the total is short by them. */
  missingTimes: number;
}

/** One summary per employee, newest sessions first in each list. */
export function payrollByEmployee(sessions: Session[], employees: TeamMember[]): EmployeePayroll[] {
  const sorted = [...sessions].sort((a, b) => (a.date === b.date ? b.time_in.localeCompare(a.time_in) : b.date.localeCompare(a.date)));
  return employees.map((employee) => {
    const mine = sorted.filter((session) => sessionEmployee(session, [employee]));
    const unpaid = mine.filter((session) => payrollState(session) === "unpaid");
    const hours = unpaid.map(sessionHours);
    return {
      employee,
      unpaid,
      inProgress: mine.filter((session) => payrollState(session) === "in_progress"),
      paid: mine.filter((session) => payrollState(session) === "paid"),
      unpaidHours: hours.reduce<Decimal>((sum, h) => (h ? sum.plus(h) : sum), d(0)),
      missingTimes: hours.filter((h) => h === null).length,
    };
  });
}
