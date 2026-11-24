"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { OvertimeControl } from "@/components/payroll/OvertimeControl";
import { SessionTagBadges } from "@/components/sessions/SessionTags";
import { useSessions } from "@/hooks/useSessions";
import { formatDateForDisplay, formatDateTimeForDisplay, formatTimeRange } from "@/lib/dates";
import { formatHours, sessionHours } from "@/lib/payroll";
import { formatMoney, type Decimal } from "@/lib/decimal";
import type { Session } from "@/lib/validation/schemas";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { sameIdentity } from "@/lib/auth/permissions";
import { paySlips, UNASSIGNED } from "@/lib/backing";
import { slipPatch } from "@/components/payroll/slips";

export function PayrollSessionRow({ session, canMark, pay }: { session: Session; canMark: boolean; pay?: Decimal | null }) {
  const { update } = useSessions();
  const user = useCurrentUser();
  const [saving, setSaving] = useState(false);
  const [slipError, setSlipError] = useState("");
  const paid = session.payroll_paid_at !== "";
  const open = session.time_out === "";
  // One slip per backer; only shown once the session has a split (an unassigned one is just the session).
  const slips = !open && pay && session.backing ? paySlips(session, pay) : [];

  async function toggleSlip(name: string, slipPaid: boolean) {
    setSaving(true);
    setSlipError("");
    try {
      await update(session.session_id, slipPatch(session, name, !slipPaid), session._row_version);
    } catch {
      setSlipError("Couldn't save that slip.");
    } finally {
      setSaving(false);
    }
  }

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
              · {formatTimeRange(session.time_in, session.time_out)}
            </span>
          </p>
          <span className="flex flex-wrap gap-1.5">
            <SessionTagBadges session={session} />
          </span>
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
      {slips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {slips.map((slip) => {
            const slipPaid = Boolean(slip.paidAt);
            const mayToggle = slip.name !== UNASSIGNED && (canMark || sameIdentity(slip.name, user));
            return (
              <button
                key={slip.name}
                type="button"
                disabled={!mayToggle || saving}
                onClick={() => void toggleSlip(slip.name, slipPaid)}
                title={slipPaid ? `Paid ${formatDateTimeForDisplay(slip.paidAt)}` : "Not paid yet"}
                className={`num min-h-8 rounded-full border px-2.5 text-xs ${
                  slipPaid ? "border-emerald-500/50 text-emerald-400" : "border-border text-amber-400"
                } ${mayToggle ? "active:bg-surface-raised" : "cursor-default"}`}
              >
                {slip.name} {formatMoney(slip.amount)} {slipPaid ? "✓" : ""}
              </button>
            );
          })}
        </div>
      ) : null}
      {slipError ? <p className="text-xs text-red-400">{slipError}</p> : null}
      {!open ? <OvertimeControl session={session} compact /> : null}
    </div>
  );
}
