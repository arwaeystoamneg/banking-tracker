"use client";

import { useState } from "react";
import { useSessions } from "@/hooks/useSessions";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { sameIdentity } from "@/lib/auth/permissions";
import { UNASSIGNED } from "@/lib/backing";
import { d, formatMoney, type Decimal } from "@/lib/decimal";
import { formatDateForDisplay } from "@/lib/dates";
import { formatHours, sessionHours } from "@/lib/payroll";
import { slipPatch } from "@/components/payroll/slips";
import type { Session } from "@/lib/validation/schemas";

export interface BackerSlip {
  session: Session;
  employee: string;
  amount: Decimal;
}

export interface BackerRow {
  name: string;
  /** Unpaid slips: this backer's share of sessions they haven't paid yet. */
  wages: Decimal;
  /** Their share of reimbursements still owed. */
  owedBack: Decimal;
  /** Slips they've paid for sessions in the date window. */
  paid: Decimal;
  slips: BackerSlip[];
}

/** Plain text to send a backer: what they owe each person, session by session. */
export function slipText(row: BackerRow): string {
  const byEmployee = new Map<string, BackerSlip[]>();
  for (const slip of row.slips) byEmployee.set(slip.employee, [...(byEmployee.get(slip.employee) ?? []), slip]);
  const lines = [`Pay slip · ${row.name}`, `Owes ${formatMoney(row.wages)} in wages for ${row.slips.length} session${row.slips.length === 1 ? "" : "s"}`];
  for (const [employee, slips] of byEmployee) {
    const subtotal = slips.reduce((sum, slip) => sum.plus(slip.amount), d(0));
    lines.push("", `${employee}: ${formatMoney(subtotal)}`);
    for (const slip of [...slips].sort((a, b) => a.session.date.localeCompare(b.session.date))) {
      lines.push(`  ${formatDateForDisplay(slip.session.date)} · ${formatHours(sessionHours(slip.session))} · ${formatMoney(slip.amount)}`);
    }
  }
  if (!row.owedBack.isZero()) lines.push("", `Plus ${formatMoney(row.owedBack)} of reimbursements owed`);
  return lines.join("\n");
}

/**
 * One backer on the Pay tab: what they owe, and their unpaid slips (their share of each session's pay). The
 * backer themself, Ray or an admin can mark slips paid one by one or all at once; Copy slip makes the text to send.
 */
export function BackerSlips({ row, canMark, paidLabel }: { row: BackerRow; canMark: boolean; paidLabel: string }) {
  const user = useCurrentUser();
  const { update } = useSessions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const owes = row.wages.plus(row.owedBack);
  const unassigned = row.name === UNASSIGNED;
  const mayPay = !unassigned && (canMark || sameIdentity(row.name, user));

  async function pay(slips: BackerSlip[]) {
    setBusy(true);
    setMessage("");
    let failed = 0;
    for (const slip of slips) {
      try {
        await update(slip.session.session_id, slipPatch(slip.session, row.name, true), slip.session._row_version);
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    setMessage(failed ? `${failed} couldn't be saved; try again.` : `Marked ${slips.length} paid.`);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(slipText(row));
      setMessage("Slip copied.");
    } catch {
      setMessage("Couldn't copy.");
    }
  }

  return (
    <div className="py-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="block w-full text-left">
        <div className="flex items-baseline justify-between gap-3">
          <p className={`truncate text-sm font-medium ${unassigned ? "text-amber-400" : "text-foreground"}`}>
            {row.name} <span className="text-xs font-normal text-muted">{row.slips.length ? `· ${row.slips.length} slip${row.slips.length === 1 ? "" : "s"} ${open ? "▴" : "▾"}` : ""}</span>
          </p>
          <p className={`num text-sm font-semibold ${owes.isZero() ? "text-muted" : "text-amber-400"}`}>
            {owes.isZero() ? "owes nothing" : `owes ${formatMoney(owes)}`}
          </p>
        </div>
        <p className="num text-xs text-muted">
          {formatMoney(row.wages)} unpaid wages · {formatMoney(row.owedBack)} reimbursements · {formatMoney(row.paid)} {paidLabel}
        </p>
      </button>
      {open && row.slips.length > 0 ? (
        <div className="mt-2 space-y-1 rounded-xl border border-border bg-surface-inset p-2">
          {row.slips.map((slip) => (
            <div key={slip.session.session_id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-muted-strong">
                {slip.employee} · {formatDateForDisplay(slip.session.date)} · {formatHours(sessionHours(slip.session))}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="num font-semibold text-amber-400">{formatMoney(slip.amount)}</span>
                {mayPay ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void pay([slip])}
                    className="min-h-8 rounded-lg border border-border px-2 text-foreground active:bg-surface-raised disabled:opacity-50"
                  >
                    Paid ✓
                  </button>
                ) : null}
              </span>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            {!unassigned ? (
              <button type="button" onClick={() => void copy()} className="min-h-9 rounded-lg border border-border px-3 text-xs font-medium text-foreground active:bg-surface-raised">
                Copy slip
              </button>
            ) : null}
            {mayPay && row.slips.length > 1 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void pay(row.slips)}
                className="min-h-9 rounded-lg border border-border px-3 text-xs font-medium text-foreground active:bg-surface-raised disabled:opacity-50"
              >
                {busy ? "Saving…" : `Mark all ${row.slips.length} paid`}
              </button>
            ) : null}
          </div>
          {unassigned ? <p className="text-xs text-amber-400">Set who backs these sessions to split them into slips.</p> : null}
        </div>
      ) : null}
      {message ? <p className="mt-1 text-xs text-emerald-400">{message}</p> : null}
    </div>
  );
}
