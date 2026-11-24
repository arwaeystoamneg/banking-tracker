"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { useSessions } from "@/hooks/useSessions";
import { canMarkPayrollPaid } from "@/lib/payroll";
import { parseMoneyInput } from "@/lib/decimal";
import type { Session } from "@/lib/validation/schemas";

const partlyPaid = (session: Session) => Boolean(session.payroll_paid_at || session.backer_paid?.trim());

function rateText(session: Pick<Session, "pay_rate" | "pay_rate_ot">): string {
  if (session.pay_rate === null || session.pay_rate === undefined) return "";
  return `$${session.pay_rate}/h · overtime $${session.pay_rate_ot ?? session.pay_rate * 1.5}/h`;
}

/**
 * The pay rate for a trip (every unpaid session on it) or a single session, instead of the player's own rate.
 * Ray or admin only. Paid (or partly paid) sessions keep what they were paid at. New sessions auto-added to the
 * trip pick the rate up when every session on the trip shares it.
 */
export function PayRateControl({ sessions, scope }: { sessions: Session[]; scope: "trip" | "session" }) {
  const user = useCurrentUser();
  const { update } = useSessions();
  const [editing, setEditing] = useState(false);
  const [base, setBase] = useState("");
  const [overtime, setOvertime] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!canMarkPayrollPaid(user) || sessions.length === 0) return null;

  const open = sessions.filter((session) => !partlyPaid(session));
  const rates = new Set(sessions.map(rateText));
  const shared = rates.size === 1 ? [...rates][0] : null;

  async function apply(payRate: number | null, payRateOt: number | null) {
    setBusy(true);
    setMessage("");
    let failed = 0;
    for (const session of open) {
      try {
        await update(session.session_id, { pay_rate: payRate, pay_rate_ot: payRateOt }, session._row_version);
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    if (failed) setMessage(`${failed} couldn't be saved; try again.`);
    else {
      setEditing(false);
      const skipped = sessions.length - open.length;
      setMessage(
        scope === "trip"
          ? `Set on ${open.length} unpaid session${open.length === 1 ? "" : "s"}${skipped ? `; ${skipped} already paid kept their pay` : ""}.`
          : "Saved.",
      );
    }
  }

  function save() {
    const b = base.trim() === "" ? null : parseMoneyInput(base);
    const o = overtime.trim() === "" ? null : parseMoneyInput(overtime);
    if (b === null || !Number.isFinite(b) || b < 0 || (o !== null && (!Number.isFinite(o) || o < 0))) {
      setMessage("Enter a base $/h (overtime optional).");
      return;
    }
    void apply(b, o);
  }

  return (
    <section className="space-y-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">{scope === "trip" ? "Pay for this trip" : "Pay rate for this session"}</p>
          <p className="text-xs text-muted">
            {scope === "trip"
              ? "One $/h for everyone's sessions on this trip, instead of each player's own rate."
              : "Overrides the player's own rate for this session."}
          </p>
        </div>
        {!editing && open.length > 0 ? (
          <button type="button" onClick={() => setEditing(true)} className="min-h-9 shrink-0 text-sm font-medium text-emerald-400">
            {shared ? "Change" : "Set rate"}
          </button>
        ) : null}
      </div>
      {!editing ? (
        <p className="text-sm text-foreground">
          {shared ? shared : shared === "" ? <span className="text-muted">Each player&apos;s own rate</span> : <span className="text-muted">Mixed rates</span>}
        </p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-xs text-muted">Base $/h</span>
              <Input value={base} onChange={(e) => setBase(e.target.value)} inputMode="decimal" placeholder="60" className="h-11" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted">Overtime $/h</span>
              <Input value={overtime} onChange={(e) => setOvertime(e.target.value)} inputMode="decimal" placeholder="1.5× base" className="h-11" />
            </label>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy} className="h-10 flex-1 text-sm">
              {busy ? "Saving…" : scope === "trip" ? `Apply to ${open.length} unpaid` : "Save rate"}
            </Button>
            {shared !== "" ? (
              <Button variant="secondary" onClick={() => void apply(null, null)} disabled={busy} className="h-10 text-sm">
                Use player&apos;s rate
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy} className="h-10 text-sm text-muted">
              Cancel
            </Button>
          </div>
        </div>
      )}
      {open.length === 0 ? <p className="text-xs text-muted">Already paid; the rate can&apos;t change now.</p> : null}
      {message ? <p className="text-xs text-emerald-400">{message}</p> : null}
    </section>
  );
}
