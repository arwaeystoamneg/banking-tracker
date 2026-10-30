"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { OvertimeControl } from "@/components/payroll/OvertimeControl";
import { useSessions } from "@/hooks/useSessions";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { formatDateTimeForDisplay } from "@/lib/dates";
import { canMarkPayrollPaid, formatHours, payrollState, sessionHours } from "@/lib/payroll";
import type { Session } from "@/lib/validation/schemas";

/** Shown on an employee's session: hours worked and whether they've been paid for it. */
export function PayrollStatus({ session }: { session: Session }) {
  const user = useCurrentUser();
  const { update } = useSessions();
  const [saving, setSaving] = useState(false);
  const state = payrollState(session);
  const canMark = canMarkPayrollPaid(user);

  async function setPaid(paid: boolean) {
    setSaving(true);
    try {
      await update(
        session.session_id,
        paid ? { payroll_paid_at: new Date().toISOString(), payroll_paid_by: "…" } : { payroll_paid_at: "", payroll_paid_by: "" },
        session._row_version,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link href="/payroll" className="text-xs font-medium uppercase tracking-wide text-muted">
              Payroll
            </Link>
            {state === "paid" || state === "before_tracking" ? (
              <Badge tone="accent">Paid</Badge>
            ) : state === "unpaid" ? (
              <Badge tone="warning">Unpaid</Badge>
            ) : (
              <Badge>In progress</Badge>
            )}
          </div>
          <p className="mt-1 text-foreground">
            <span className="num font-semibold">{formatHours(sessionHours(session))}</span>
            <span className="text-xs text-muted">
              {state === "paid" && session.payroll_paid_by && session.payroll_paid_by !== "…"
                ? ` · paid by ${session.payroll_paid_by}, ${formatDateTimeForDisplay(session.payroll_paid_at)}`
                : state === "before_tracking"
                  ? " · paid before payroll tracking"
                  : ""}
            </span>
          </p>
        </div>
        {canMark && state === "unpaid" ? (
          <Button onClick={() => setPaid(true)} disabled={saving} className="h-10 shrink-0 px-3 text-xs">
            {saving ? "…" : "Mark paid"}
          </Button>
        ) : canMark && state === "paid" ? (
          <Button variant="ghost" onClick={() => setPaid(false)} disabled={saving} className="h-10 shrink-0 px-3 text-xs text-muted">
            Undo
          </Button>
        ) : null}
      </div>
      {session.time_out ? <OvertimeControl session={session} /> : null}
    </section>
  );
}
