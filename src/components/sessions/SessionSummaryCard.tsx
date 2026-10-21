"use client";

import { useMemo, useState } from "react";
import { useRounds } from "@/hooks/useRounds";
import { useSessions } from "@/hooks/useSessions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { d, formatMoney, formatPercent } from "@/lib/decimal";
import { isSessionOpen } from "@/lib/sessionHelpers";
import type { Round, Session } from "@/lib/validation/schemas";
import { useLiveTime } from "@/hooks/useLiveTime";

export function roundTotals(rounds: Round[]) {
  const actionOffered = rounds.reduce((sum, r) => sum.plus(d(r.tta)), d(0));
  const actionBooked = rounds.reduce((sum, r) => sum.plus(d(r.booked)), d(0));
  const bonusAction = rounds.reduce((sum, r) => sum.plus(d(r.bonus_action ?? 0)), d(0));
  const collectionPaid = rounds.reduce((sum, r) => sum.plus(d(r.fee_paid)), d(0));
  const grossWl = rounds.reduce((sum, r) => sum.plus(d(r.result)), d(0));
  const netPnl = grossWl.minus(collectionPaid);
  const coveragePct = actionOffered.isZero() ? null : actionBooked.dividedBy(actionOffered);
  return { actionOffered, actionBooked, bonusAction, collectionPaid, grossWl, netPnl, coveragePct };
}

/** Ends an open session. Legacy sessions with logged rounds also get their round totals saved. */
export function EndSessionCard({ session }: { session: Session }) {
  const { rounds } = useRounds(session.session_id);
  const { update } = useSessions();
  const [buyOut, setBuyOut] = useState(session.buy_out === null ? "" : String(session.buy_out));
  const [timeOut, setTimeOut, timeOutForSave] = useLiveTime(session.time_out);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");

  const totals = useMemo(() => roundTotals(rounds), [rounds]);
  const buyOutAmount = Number(buyOut);
  const validBuyOut = buyOut !== "" && Number.isFinite(buyOutAmount) && buyOutAmount >= 0;
  // Rounds with no offered action would close without coverage, which round analytics depend on.
  const roundsMissingCoverage = rounds.length > 0 && totals.coveragePct === null;
  const canClose = validBuyOut && !roundsMissingCoverage;
  const preview = validBuyOut ? d(buyOutAmount).minus(session.buy_in) : null;

  async function handleClose() {
    if (!canClose) return;
    setClosing(true);
    setCloseError("");
    try {
      await update(
        session.session_id,
        {
          buy_out: buyOutAmount,
          time_out: timeOutForSave(),
          ...(rounds.length > 0
            ? {
                rounds_banked: rounds.length,
                action_offered: totals.actionOffered.toNumber(),
                action_booked: totals.actionBooked.toNumber(),
                coverage_pct: totals.coveragePct!.toNumber(),
                bonus_action_booked: totals.bonusAction.toNumber(),
                collection_paid: totals.collectionPaid.toNumber(),
                gross_wl: totals.grossWl.toNumber(),
                net_pnl: totals.netPnl.toNumber(),
              }
            : {}),
        },
        session._row_version,
      );
    } catch {
      setCloseError("Could not end the session. Check sync status and try again.");
    } finally {
      setClosing(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-emerald-500/30 bg-surface p-4">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs text-muted">
          Buy out
          <Input value={buyOut} onChange={(event) => setBuyOut(event.target.value)} inputMode="decimal" placeholder="0" />
        </label>
        <label className="space-y-1 text-xs text-muted">
          Time out
          <Input type="time" value={timeOut} onChange={(event) => setTimeOut(event.target.value)} />
        </label>
      </div>
      {preview ? (
        <p className="text-sm text-muted">
          Result{" "}
          <span className={`num font-semibold ${preview.isNegative() ? "text-red-400" : "text-emerald-400"}`}>
            {formatMoney(preview)}
          </span>
        </p>
      ) : null}
      {roundsMissingCoverage ? (
        <p className="text-xs text-amber-400">Logged rounds have no offered action, so coverage can&apos;t be computed.</p>
      ) : null}
      {closeError ? <p className="text-xs text-red-400">{closeError}</p> : null}
      <Button onClick={handleClose} disabled={!canClose || closing} className="h-14 w-full text-base">
        {closing ? "Saving…" : "End session"}
      </Button>
    </section>
  );
}

/** Round-level totals. Only meaningful once at least one round is logged. */
export function SessionSummaryCard({ session }: { session: Session }) {
  const { rounds } = useRounds(session.session_id);
  const totals = useMemo(() => roundTotals(rounds), [rounds]);
  if (rounds.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-surface p-4 text-sm">
      <Stat label="Rounds" value={String(rounds.length)} />
      <Stat label="Coverage" value={totals.coveragePct ? formatPercent(totals.coveragePct, 1) : "—"} />
      <Stat label="Action booked" value={formatMoney(totals.actionBooked)} />
      <Stat label="Collection paid" value={formatMoney(totals.collectionPaid)} />
      <Stat label="Gross W/L" value={formatMoney(totals.grossWl)} tone={totals.grossWl.isNegative() ? "danger" : "accent"} />
      <Stat label="Net PnL" value={formatMoney(totals.netPnl)} tone={totals.netPnl.isNegative() ? "danger" : "accent"} />
      {isSessionOpen(session) ? null : <p className="col-span-2 text-center text-xs text-muted">Session closed.</p>}
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
