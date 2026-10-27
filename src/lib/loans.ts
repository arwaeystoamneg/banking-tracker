import { d, type Decimal } from "@/lib/decimal";
import type { LoanEntry } from "@/lib/validation/schemas";

export interface LoanPerson {
  key: string;
  name: string;
}

export interface LoanBalance {
  debtor: LoanPerson;
  creditor: LoanPerson;
  amount: Decimal;
}

/** Account id when known, so a renamed teammate stays one person; otherwise the name, case-insensitively. */
export function loanPersonKey(name: string, id: string): string {
  return id.trim().toLowerCase() || `name:${name.trim().toLowerCase()}`;
}

/**
 * Who owes whom, netted per pair across every loan and repayment. A loan from A to B means B owes A;
 * a repayment from B to A reduces it. If B lent back to A, the two directions cancel out.
 */
export function loanBalances(entries: LoanEntry[]): LoanBalance[] {
  const names = new Map<string, string>();
  const owed = new Map<string, Decimal>(); // "debtor|creditor" -> amount
  const add = (debtor: string, creditor: string, amount: Decimal) => {
    const key = `${debtor}|${creditor}`;
    owed.set(key, (owed.get(key) ?? d(0)).plus(amount));
  };
  for (const entry of entries) {
    const from = loanPersonKey(entry.from_name, entry.from_id);
    const to = loanPersonKey(entry.to_name, entry.to_id);
    if (from === to) continue;
    // Account names come from the server and stay current; a typed name keeps its first spelling.
    if (entry.from_id || !names.has(from)) names.set(from, entry.from_name.trim() || "Unknown");
    if (entry.to_id || !names.has(to)) names.set(to, entry.to_name.trim() || "Unknown");
    if (entry.kind === "loan") add(to, from, d(entry.amount));
    else add(from, to, d(entry.amount).negated());
  }

  const balances: LoanBalance[] = [];
  const seen = new Set<string>();
  for (const key of owed.keys()) {
    const [a, b] = key.split("|");
    const pair = [a, b].sort().join("|");
    if (seen.has(pair)) continue;
    seen.add(pair);
    const net = (owed.get(`${a}|${b}`) ?? d(0)).minus(owed.get(`${b}|${a}`) ?? d(0));
    if (net.isZero()) continue;
    const [debtor, creditor] = net.isPositive() ? [a, b] : [b, a];
    balances.push({
      debtor: { key: debtor, name: names.get(debtor) ?? "Unknown" },
      creditor: { key: creditor, name: names.get(creditor) ?? "Unknown" },
      amount: net.abs(),
    });
  }
  return balances.sort((x, y) => y.amount.comparedTo(x.amount));
}

export function compareLoanEntries(a: LoanEntry, b: LoanEntry): number {
  return a.date === b.date ? b.recorded_at.localeCompare(a.recorded_at) : b.date.localeCompare(a.date);
}
