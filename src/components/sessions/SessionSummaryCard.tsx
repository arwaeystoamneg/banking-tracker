"use client";

import { useMemo, useState } from "react";
import { useRounds } from "@/hooks/useRounds";
import { useSessions } from "@/hooks/useSessions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { d, formatMoney, formatPercent } from "@/lib/decimal";
import { currentTimeString } from "@/lib/dates";
import { isSessionOpen } from "@/lib/sessionHelpers";
import type { Session } from "@/lib/validation/schemas";

export function SessionSummaryCard({ session }: { session: Session }) {
  const { rounds } = useRounds(session.session_id);
  const { update } = useSessions();
  const [closing, setClosing] = useState(false);
  const [buyOut, setBuyOut] = useState(session.buy_out === null ? "" : String(session.buy_out));
  const [timeOut, setTimeOut] = useState(session.time_out);

  const totals = useMemo(() => {
    const actionOffered = rounds.reduce((sum, r) => sum.plus(d(r.tta)), d(0));
    const actionBooked = rounds.reduce((sum, r) => sum.plus(d(r.booked)), d(0));
    const bonusAction = rounds.reduce((sum, r) => sum.plus(d(r.bonus_action ?? 0)), d(0));
    const collectionPaid = rounds.reduce((sum, r) => sum.plus(d(r.fee_paid)), d(0));
    const grossWl = rounds.reduce((sum, r) => sum.plus(d(r.result)), d(0));
    const netPnl = grossWl.minus(collectionPaid);
    const coveragePct = actionOffered.isZero() ? null : actionBooked.dividedBy(actionOffered);
    return { actionOffered, actionBooked, bonusAction, collectionPaid, grossWl, netPnl, coveragePct };
  }, [rounds]);

  const open = isSessionOpen(session);
  const buyOutAmount = Number(buyOut);
  const validBuyOut = buyOut !== "" && Number.isFinite(buyOutAmount) && buyOutAmount >= 0;
  // Never let a session be saved without coverage_pct — the most diagnostically valuable field in the schema.
  const canClose = rounds.length > 0 && totals.coveragePct !== null && validBuyOut && timeOut !== "";

  async function handleClose() {
    if (!canClose) return;
    setClosing(true);
    await update(
      session.session_id,
      {
        rounds_banked: rounds.length,
        action_offered: totals.actionOffered.toNumber(),
        action_booked: totals.actionBooked.toNumber(),
        coverage_pct: totals.coveragePct!.toNumber(),
        bonus_action_booked: totals.bonusAction.toNumber(),
        collection_paid: totals.collectionPaid.toNumber(),
        gross_wl: totals.grossWl.toNumber(),
        net_pnl: totals.netPnl.toNumber(),
        buy_out: buyOutAmount,
        time_out: timeOut,
      },
      session._row_version,
    );
    setClosing(false);
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Rounds" value={String(rounds.length)} />
        <Stat label="Coverage" value={totals.coveragePct ? formatPercent(totals.coveragePct, 1) : "—"} />
        <Stat label="Action booked" value={formatMoney(totals.actionBooked)} />
        <Stat label="Collection paid" value={formatMoney(totals.collectionPaid)} />
        <Stat label="Gross W/L" value={formatMoney(totals.grossWl)} tone={totals.grossWl.isNegative() ? "danger" : "accent"} />
        <Stat label="Net PnL" value={formatMoney(totals.netPnl)} tone={totals.netPnl.isNegative() ? "danger" : "accent"} />
      </div>

      {open ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-muted">
              Buy out
              <Input
                value={buyOut}
                onChange={(event) => setBuyOut(event.target.value)}
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Required to close"
              />
            </label>
            <label className="space-y-1 text-xs text-muted">
              Time out
              <Input
                type="time"
                value={timeOut}
                onChange={(event) => setTimeOut(event.target.value)}
                onFocus={() => {
                  if (!timeOut) setTimeOut(currentTimeString());
                }}
              />
            </label>
          </div>
          {!canClose ? (
            <p className="text-xs text-amber-400">
              Enter buy-out and time-out, and log at least one round before closing.
            </p>
          ) : null}
          <Button onClick={handleClose} disabled={!canClose || closing} className="w-full">
            {closing ? "Closing…" : "Close session"}
          </Button>
        </>
      ) : (
        <p className="text-center text-xs text-muted">Session closed.</p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "accent" | "danger" }) {
  const toneClass = tone === "danger" ? "text-red-400" : tone === "accent" ? "text-emerald-400" : "text-foreground";
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-base font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
