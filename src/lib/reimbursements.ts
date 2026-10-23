import { d, type Decimal } from "@/lib/decimal";
import type { Reimbursement } from "@/lib/validation/schemas";

/** Unpaid totals per person, largest first. Keyed by account id when known so name edits don't split a person. */
export function owedByPerson(items: Reimbursement[]): { name: string; total: Decimal; count: number }[] {
  const groups = new Map<string, { name: string; total: Decimal; count: number }>();
  for (const item of items) {
    if (item.status !== "owed") continue;
    const key = item.payee_id.trim() || `name:${item.payee.trim().toLowerCase()}`;
    const group = groups.get(key) ?? { name: item.payee.trim() || "Unknown", total: d(0), count: 0 };
    group.total = group.total.plus(item.amount);
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.total.comparedTo(a.total));
}

export function totalOwed(items: Reimbursement[]): Decimal {
  return items.filter((item) => item.status === "owed").reduce((sum, item) => sum.plus(item.amount), d(0));
}

/** Owed first (oldest spend first, since those have waited longest), then paid (most recently paid first). */
export function compareReimbursements(a: Reimbursement, b: Reimbursement): number {
  if (a.status !== b.status) return a.status === "owed" ? -1 : 1;
  if (a.status === "owed") return a.date === b.date ? a.requested_at.localeCompare(b.requested_at) : a.date.localeCompare(b.date);
  return b.paid_at.localeCompare(a.paid_at);
}
