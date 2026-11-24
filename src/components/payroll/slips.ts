import { formatBackerPaid, parseBackerPaid, UNASSIGNED } from "@/lib/backing";
import type { Session } from "@/lib/validation/schemas";

/** The session's `backer_paid` after one backer pays (or un-pays) their slip. */
export function backerPaidWith(session: Pick<Session, "backer_paid">, name: string, paid: boolean): string {
  const map = parseBackerPaid(session.backer_paid);
  if (paid) map.set(name.toLowerCase(), { name, at: new Date().toISOString() });
  else map.delete(name.toLowerCase());
  return formatBackerPaid(map);
}

/** The patch that pays (or un-pays) one slip. An unassigned session's only slip is the whole session. */
export function slipPatch(session: Session, name: string, paid: boolean): Partial<Session> {
  if (name === UNASSIGNED) {
    return paid ? { payroll_paid_at: new Date().toISOString(), payroll_paid_by: "…" } : { payroll_paid_at: "", payroll_paid_by: "" };
  }
  return { backer_paid: backerPaidWith(session, name, paid) };
}
