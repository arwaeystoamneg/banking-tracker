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

  // In lists (compact) these are quiet text links so every row isn't a wall of buttons.
  const act = (label: string, next: OvertimeStatus, tone: "primary" | "secondary" | "ghost") =>
    compact ? (
      <button
        key={label}
        type="button"
        onClick={() => set(next)}
        disabled={saving}
        className={`min-h-8 text-xs font-medium disabled:opacity-50 ${tone === "primary" ? "text-emerald-400" : "text-muted active:text-foreground"}`}
      >
        {label}
      </button>
    ) : (
      <Button key={label} variant={tone} onClick={() => set(next)} disabled={saving} className={`h-10 px-3 text-xs ${tone === "ghost" ? "text-muted" : ""}`}>
        {label}
      </Button>
    );

  let actions: React.ReactNode = null;
  if (!locked && approver) {
    actions =
      status === "requested"
        ? [act("Approve OT", "approved", "primary"), act("Decline", "declined", "ghost")]
        : status === "approved"
          ? act("Remove OT", "", "ghost")
          : act(compact ? "Make overtime" : "Make OT", "approved", "secondary");
  } else if (!locked && ownsSession(user, session)) {
    actions =
      status === ""
        ? act("Request overtime", "requested", compact ? "primary" : "secondary")
        : status === "requested"
          ? act("Withdraw request", "", "ghost")
          : null;
  }

  return (
    <div className={`flex flex-wrap items-center ${compact ? "gap-x-3 gap-y-1" : "gap-2"}`}>
      <OvertimeBadge status={status} />
      {actions}
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}
