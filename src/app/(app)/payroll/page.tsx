"use client";

import { useMemo, useState } from "react";
import { useSessions } from "@/hooks/useSessions";
import { Button } from "@/components/ui/Button";
import { PaySwitcher } from "@/components/payroll/PaySwitcher";
import { PayrollSessionRow } from "@/components/payroll/PayrollSessionRow";
import { useCurrentUser, useTeam } from "@/components/providers/AuthProvider";
import { formatDateForDisplay } from "@/lib/dates";
import {
  PAYROLL_START_DATE,
  canMarkPayrollPaid,
  canSeeAllPayroll,
  employeesOf,
  formatHours,
  payrollByEmployee,
  type EmployeePayroll,
} from "@/lib/payroll";

export default function PayrollPage() {
  const user = useCurrentUser();
  const team = useTeam();
  const { sessions, isLoading } = useSessions();
  const canMark = canMarkPayrollPaid(user);

  const employees = useMemo(() => {
    const all = employeesOf(team);
    return canSeeAllPayroll(user) ? all : all.filter((employee) => employee.id === user.userId);
  }, [team, user]);
  const summaries = useMemo(() => payrollByEmployee(sessions, employees), [sessions, employees]);

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <PaySwitcher />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Payroll</h1>
        <p className="text-sm text-muted">
          Employee sessions since {formatDateForDisplay(PAYROLL_START_DATE)}. {canMark ? "Check each one off once paid." : "Ray or an admin checks sessions off once paid."}
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : employees.length === 0 ? (
        <p className="text-sm text-muted">
          {user.role === "demo" ? "Payroll isn't part of the demo." : "No employee accounts yet."}
        </p>
      ) : (
        summaries.map((summary) => <EmployeeCard key={summary.employee.id} summary={summary} canMark={canMark} />)
      )}
    </main>
  );
}

function EmployeeCard({ summary, canMark }: { summary: EmployeePayroll; canMark: boolean }) {
  const { update } = useSessions();
  const [showPaid, setShowPaid] = useState(false);
  const [payingAll, setPayingAll] = useState(false);
  const owed = summary.unpaid.length;

  async function markAllPaid() {
    setPayingAll(true);
    try {
      for (const session of summary.unpaid) {
        await update(session.session_id, { payroll_paid_at: new Date().toISOString(), payroll_paid_by: "…" }, session._row_version);
      }
    } finally {
      setPayingAll(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground">{summary.employee.name}</h2>
          <p className="text-sm">
            {owed === 0 ? (
              <span className="text-emerald-400">All paid up</span>
            ) : (
              <>
                <span className="num font-semibold text-amber-400">{formatHours(summary.unpaidHours)}</span>
                <span className="text-muted">
                  {" "}
                  unpaid · {owed} session{owed === 1 ? "" : "s"}
                </span>
              </>
            )}
          </p>
          {summary.missingTimes > 0 ? (
            <p className="text-xs text-amber-400">
              {summary.missingTimes} session{summary.missingTimes === 1 ? " is" : "s are"} missing times, so the hours are short.
            </p>
          ) : null}
        </div>
        {canMark && owed > 1 ? (
          <Button onClick={markAllPaid} disabled={payingAll} className="h-10 shrink-0 px-3 text-xs">
            {payingAll ? "Saving…" : "Mark all paid"}
          </Button>
        ) : null}
      </div>

      {summary.unpaid.length + summary.inProgress.length > 0 ? (
        <div>
          {summary.inProgress.map((session) => (
            <PayrollSessionRow key={session.session_id} session={session} canMark={canMark} />
          ))}
          {summary.unpaid.map((session) => (
            <PayrollSessionRow key={session.session_id} session={session} canMark={canMark} />
          ))}
        </div>
      ) : null}

      {summary.paid.length > 0 ? (
        <div className="border-t border-border pt-2">
          <button onClick={() => setShowPaid((v) => !v)} className="min-h-9 text-sm font-medium text-muted active:text-foreground">
            {showPaid ? "Hide" : "Show"} paid ({summary.paid.length})
          </button>
          {showPaid ? (
            <div>
              {summary.paid.map((session) => (
                <PayrollSessionRow key={session.session_id} session={session} canMark={canMark} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
