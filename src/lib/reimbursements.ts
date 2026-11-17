import { d, type Decimal } from "@/lib/decimal";
import type { Reimbursement } from "@/lib/validation/schemas";

export interface PersonReimbursements {
  name: string;
  /** Still owed, oldest spend first: what "Pay all" settles. */
  owedItems: Reimbursement[];
  owed: Decimal;
  paid: Decimal;
  paidCount: number;
}

const personKey = (item: Reimbursement) => item.payee_id.trim() || `name:${item.payee.trim().toLowerCase()}`;

/** Owed and paid totals per person, most owed first. Keyed by account id when known so name edits don't split a person. */
export function reimbursementsByPerson(items: Reimbursement[]): PersonReimbursements[] {
  const groups = new Map<string, PersonReimbursements>();
  for (const item of [...items].sort(compareReimbursements)) {
    const key = personKey(item);
    const group = groups.get(key) ?? { name: item.payee.trim() || "Unknown", owedItems: [], owed: d(0), paid: d(0), paidCount: 0 };
    if (item.status === "owed") {
      group.owedItems.push(item);
      group.owed = group.owed.plus(item.amount);
    } else {
      group.paid = group.paid.plus(item.amount);
      group.paidCount += 1;
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.owed.comparedTo(a.owed) || b.paid.comparedTo(a.paid));
}

export function totalOwed(items: Reimbursement[]): Decimal {
  return items.filter((item) => item.status === "owed").reduce((sum, item) => sum.plus(item.amount), d(0));
}

export function totalPaid(items: Reimbursement[]): Decimal {
  return items.filter((item) => item.status === "paid").reduce((sum, item) => sum.plus(item.amount), d(0));
}

/** Owed first (oldest spend first, since those have waited longest), then paid (most recently paid first). */
export function compareReimbursements(a: Reimbursement, b: Reimbursement): number {
  if (a.status !== b.status) return a.status === "owed" ? -1 : 1;
  if (a.status === "owed") return a.date === b.date ? a.requested_at.localeCompare(b.requested_at) : a.date.localeCompare(b.date);
  return b.paid_at.localeCompare(a.paid_at);
}
