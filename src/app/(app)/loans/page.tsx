"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLoans } from "@/hooks/useLoans";
import { Button } from "@/components/ui/Button";
import { PaySwitcher } from "@/components/payroll/PaySwitcher";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { canRecordLoans, sameIdentity } from "@/lib/auth/permissions";
import { isConfiguredAccountRole, type AuthUser } from "@/lib/auth/types";
import { compareLoanEntries, loanBalances } from "@/lib/loans";
import { formatDateForDisplay } from "@/lib/dates";
import { formatMoney } from "@/lib/decimal";
import type { LoanEntry } from "@/lib/validation/schemas";

function involves(entry: LoanEntry, user: AuthUser): boolean {
  return [entry.from_id, entry.to_id, entry.from_name, entry.to_name].some(
    (v) => v.trim() && sameIdentity(v, user),
  );
}

export default function LoansPage() {
  const user = useCurrentUser();
  const { loans, isLoading } = useLoans();
  const [mineOnly, setMineOnly] = useState(false);
  const canFilterMine = isConfiguredAccountRole(user.role);

  const visible = useMemo(
    () =>
      mineOnly && canFilterMine
        ? loans.filter((entry) => involves(entry, user))
        : loans,
    [loans, mineOnly, canFilterMine, user],
  );
  const balances = useMemo(() => loanBalances(visible), [visible]);
  const history = useMemo(
    () => [...visible].sort(compareLoanEntries),
    [visible],
  );

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <PaySwitcher />
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Loans
          </h1>
          <p className="text-sm text-muted">
            {isLoading
              ? "Loading…"
              : balances.length === 0
                ? "Everyone is square"
                : `${balances.length} open balance${balances.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {canRecordLoans(user) ? (
          <Link href="/loans/new">
            <Button className="h-10 px-4 text-sm">+ Record</Button>
          </Link>
        ) : null}
      </div>

      {canFilterMine && loans.length > 0 ? (
        <div className="inline-flex rounded-xl border border-border bg-surface p-0.5 text-sm">
          {[false, true].map((mine) => (
            <button
              key={String(mine)}
              onClick={() => setMineOnly(mine)}
              className={`min-h-9 rounded-lg px-3 py-1.5 font-medium transition-colors ${
                mineOnly === mine
                  ? "bg-surface-raised text-foreground"
                  : "text-muted active:text-foreground"
              }`}
            >
              {mine ? "Mine" : "Everyone"}
            </button>
          ))}
        </div>
      ) : null}

      {balances.length > 0 ? (
        <section className="space-y-1 rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
            Who owes whom
          </h2>
          <div className="divide-y divide-border">
            {balances.map((balance) => {
              const params = new URLSearchParams({
                kind: "repayment",
                from_id: balance.debtor.key.startsWith("name:")
                  ? ""
                  : balance.debtor.key,
                from_name: balance.debtor.name,
                to_id: balance.creditor.key.startsWith("name:")
                  ? ""
                  : balance.creditor.key,
                to_name: balance.creditor.name,
                amount: balance.amount.toString(),
              });
              return (
                <div
                  key={`${balance.debtor.key}|${balance.creditor.key}`}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <p className="min-w-0 text-sm text-foreground">
                    <span className="font-medium">{balance.debtor.name}</span>
                    <span className="text-muted"> owes </span>
                    <span className="font-medium">{balance.creditor.name}</span>
                    <span className="num block font-semibold text-amber-400">
                      {formatMoney(balance.amount)}
                    </span>
                  </p>
                  {canRecordLoans(user) ? (
                    <Link
                      href={`/loans/new?${params.toString()}`}
                      className="shrink-0"
                    >
                      <Button variant="secondary" className="h-10 px-3 text-xs">
                        Repay
                      </Button>
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {isLoading ? null : history.length === 0 ? (
        <p className="text-sm text-muted">No loans recorded yet.</p>
      ) : (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
            History
          </h2>
          {history.map((entry) => (
            <Link
              key={entry.loan_entry_id}
              href={`/loans/${entry.loan_entry_id}`}
              className="block rounded-2xl border border-border bg-surface p-4 transition-colors active:bg-surface-raised"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-base font-medium text-foreground">
                  {entry.from_name} → {entry.to_name}
                </p>
                <p
                  className={`num text-base font-semibold ${entry.kind === "loan" ? "text-foreground" : "text-emerald-400"}`}
                >
                  {formatMoney(entry.amount)}
                </p>
              </div>
              <p className="truncate text-sm text-muted">
                {entry.kind === "loan" ? "Loan" : "Repayment"} ·{" "}
                <span className="num">{formatDateForDisplay(entry.date)}</span>
                {entry.note ? ` · ${entry.note}` : ""}
              </p>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
