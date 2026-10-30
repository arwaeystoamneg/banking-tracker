"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { OvertimeControl } from "@/components/payroll/OvertimeControl";
import { useSessions } from "@/hooks/useSessions";
import { formatDateForDisplay, formatDateTimeForDisplay } from "@/lib/dates";
import { formatHours, sessionHours } from "@/lib/payroll";
import { formatMoney, type Decimal } from "@/lib/decimal";
import type { Session } from "@/lib/validation/schemas";

export function PayrollSessionRow({ session, canMark, pay }: { session: Session; canMark: boolean; pay?: Decimal | null }) {
  const { update } = useSessions();
  const [saving, setSaving] = useState(false);
  const paid = session.payroll_paid_at !== "";
  const open = session.time_out === "";

  async function toggle() {
    setSaving(true);
    try {
      await update(
        session.session_id,
        paid ? { payroll_paid_at: "", payroll_paid_by: "" } : { payroll_paid_at: new Date().toISOString(), payroll_paid_by: "…" },
        session._row_version,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5 border-t border-border py-2.5 first:border-t-0">
      <div className="flex items-center gap-3">
        <Link href={`/sessions/${session.session_id}`} className="min-w-0 flex-1">
          <p className="text-sm text-foreground">
            <span className="num">{formatDateForDisplay(session.date)}</span>
            <span className="text-muted">
              {" "}
              · {session.time_in || "—"}–{session.time_out || "now"}
            </span>
          </p>
          {paid ? (
            <p className="text-xs text-muted">
              Paid{session.payroll_paid_by && session.payroll_paid_by !== "…" ? ` by ${session.payroll_paid_by}` : ""} ·{" "}
              {formatDateTimeForDisplay(session.payroll_paid_at)}
            </p>
          ) : null}
        </Link>
        <span className="w-20 text-right">
          <span className={`num block text-sm font-semibold ${open ? "text-muted" : paid ? "text-muted-strong" : "text-amber-400"}`}>
            {open ? "Open" : pay ? formatMoney(pay) : formatHours(sessionHours(session))}
          </span>
          {!open && pay ? <span className="num block text-[11px] text-muted">{formatHours(sessionHours(session))}</span> : null}
        </span>
        {canMark && !open ? (
          <Button
            variant={paid ? "ghost" : "secondary"}
            onClick={toggle}
            disabled={saving}
            className={`h-10 w-20 px-2 text-xs ${paid ? "text-muted" : ""}`}
          >
            {saving ? "…" : paid ? "Undo" : "Paid ✓"}
          </Button>
        ) : null}
      </div>
      {!open ? <OvertimeControl session={session} compact /> : null}
    </div>
  );
}
