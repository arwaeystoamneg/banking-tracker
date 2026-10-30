"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useSessions } from "@/hooks/useSessions";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { ownsSession } from "@/lib/auth/permissions";
import { canMarkPayrollPaid } from "@/lib/payroll";
import type { OvertimeStatus, Session } from "@/lib/validation/schemas";

const LABEL: Record<Exclude<OvertimeStatus, "">, string> = {
  requested: "OT requested",
  approved: "Overtime",
  declined: "OT declined",
};

export function OvertimeBadge({ status }: { status: OvertimeStatus }) {
  if (!status) return null;
  return <Badge tone={status === "approved" ? "accent" : status === "requested" ? "warning" : "neutral"}>{LABEL[status]}</Badge>;
}

/**
 * The player asks for overtime on a session; Ray or admin approves or declines it (or turns it on directly).
 * Nothing changes once the session is paid.
 */
export function OvertimeControl({ session, compact = false }: { session: Session; compact?: boolean }) {
  const user = useCurrentUser();
  const { update } = useSessions();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const approver = canMarkPayrollPaid(user);
  const status = session.overtime_status;
  const locked = Boolean(session.payroll_paid_at) || session.time_out === "";

  async function set(next: OvertimeStatus) {
    setSaving(true);
    setError("");
    try {
      await update(session.session_id, { overtime_status: next }, session._row_version);
    } catch {
      setError("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const size = compact ? "h-9 px-2.5 text-xs" : "h-10 px-3 text-xs";
  let actions: React.ReactNode = null;
  if (!locked && approver) {
    actions =
      status === "requested" ? (
        <>
          <Button onClick={() => set("approved")} disabled={saving} className={size}>
            Approve OT
          </Button>
          <Button variant="ghost" onClick={() => set("declined")} disabled={saving} className={`${size} text-muted`}>
            Decline
          </Button>
        </>
      ) : status === "approved" ? (
        <Button variant="ghost" onClick={() => set("")} disabled={saving} className={`${size} text-muted`}>
          Remove OT
        </Button>
      ) : (
        <Button variant="secondary" onClick={() => set("approved")} disabled={saving} className={size}>
          Make OT
        </Button>
      );
  } else if (!locked && ownsSession(user, session)) {
    actions =
      status === "" ? (
        <Button variant="secondary" onClick={() => set("requested")} disabled={saving} className={size}>
          Request overtime
        </Button>
      ) : status === "requested" ? (
        <Button variant="ghost" onClick={() => set("")} disabled={saving} className={`${size} text-muted`}>
          Withdraw request
        </Button>
      ) : null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <OvertimeBadge status={status} />
      {actions}
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}
