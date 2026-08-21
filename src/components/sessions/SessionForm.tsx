"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSessions } from "@/hooks/useSessions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { currentTimeString, todayDateString, nowIso } from "@/lib/dates";
import { getRememberedLoggedBy, rememberLoggedBy } from "@/lib/loggedInAs";

export function SessionForm() {
  const router = useRouter();
  const { create } = useSessions();

  const [casino, setCasino] = useState("");
  const [buyIn, setBuyIn] = useState("");
  const [buyOut, setBuyOut] = useState("");
  const [timeIn, setTimeIn] = useState(() => currentTimeString());
  const [timeOut, setTimeOut] = useState("");
  const [notes, setNotes] = useState("");
  const [loggedBy, setLoggedBy] = useState(() => getRememberedLoggedBy());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const buyInAmount = Number(buyIn);
    const buyOutAmount = buyOut === "" ? null : Number(buyOut);
    if (
      !casino.trim() ||
      !loggedBy.trim() ||
      !timeIn ||
      buyIn === "" ||
      !Number.isFinite(buyInAmount) ||
      buyInAmount < 0 ||
      (buyOutAmount !== null && (!Number.isFinite(buyOutAmount) || buyOutAmount < 0))
    ) {
      setError("Casino, buy-in, time-in, and logged-by name are required.");
      return;
    }

    setSubmitting(true);
    setError("");
    rememberLoggedBy(loggedBy.trim());

    try {
      const id = await create({
        date: todayDateString(),
        casino: casino.trim(),
        buy_in: buyInAmount,
        buy_out: buyOutAmount,
        time_in: timeIn,
        time_out: timeOut,
        game_id: "",
        schedule_option: "",
        rounds_banked: null,
        action_offered: null,
        action_booked: null,
        coverage_pct: null,
        bonus_action_booked: null,
        collection_paid: null,
        gross_wl: null,
        net_pnl: null,
        peak_drawdown: null,
        partners: "",
        split_terms: "",
        notes: notes.trim(),
        logged_by: loggedBy.trim(),
        logged_at: nowIso(),
      });

      router.push(`/sessions/${id}`);
    } catch {
      setError("Could not start the session. Your entry was not discarded; check sync status and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Casino</span>
        <Input value={casino} onChange={(e) => setCasino(e.target.value)} placeholder="Casino name" required />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Buy in</span>
          <Input value={buyIn} onChange={(e) => setBuyIn(e.target.value)} inputMode="decimal" min="0" step="0.01" required />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Buy out</span>
          <Input
            value={buyOut}
            onChange={(e) => setBuyOut(e.target.value)}
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="At session end"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Time in</span>
          <Input type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} required />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Time out</span>
          <Input type="time" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Session notes"
          rows={4}
          className="w-full resize-y rounded-xl border border-border bg-surface px-3 py-3 text-base text-foreground outline-none focus:border-neutral-500"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Logged by</span>
        <Input value={loggedBy} onChange={(e) => setLoggedBy(e.target.value)} placeholder="Name" required />
      </label>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Starting…" : "Start session"}
      </Button>
    </form>
  );
}
