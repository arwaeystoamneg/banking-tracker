"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useSessions } from "@/hooks/useSessions";
import { formatDateForDisplay, formatDateTimeForDisplay } from "@/lib/dates";
import { formatHours, sessionHours } from "@/lib/payroll";
import type { Session } from "@/lib/validation/schemas";

export function PayrollSessionRow({ session, canMark }: { session: Session; canMark: boolean }) {
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
    <div className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0">
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
      <span className={`num w-16 text-right text-sm font-semibold ${open ? "text-muted" : paid ? "text-muted-strong" : "text-amber-400"}`}>
        {open ? "Open" : formatHours(sessionHours(session))}
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
  );
}
