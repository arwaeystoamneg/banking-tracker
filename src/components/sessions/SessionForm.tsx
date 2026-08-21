"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSessions } from "@/hooks/useSessions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { currentTimeString, todayDateString, nowIso } from "@/lib/dates";
import { getRememberedLoggedBy, rememberLoggedBy } from "@/lib/loggedInAs";
import type { Session } from "@/lib/validation/schemas";

export function SessionForm({ session }: { session?: Session }) {
  const router = useRouter();
  const { create, update } = useSessions();
  const editing = session !== undefined;

  const [date, setDate] = useState(() => session?.date ?? todayDateString());
  const [casino, setCasino] = useState(() => session?.casino ?? "");
  const [buyIn, setBuyIn] = useState(() => (session ? String(session.buy_in) : ""));
  const [buyOut, setBuyOut] = useState(() => (session?.buy_out === null || session === undefined ? "" : String(session.buy_out)));
  const [timeIn, setTimeIn] = useState(() => session?.time_in ?? currentTimeString());
  const [timeOut, setTimeOut] = useState(() => session?.time_out ?? "");
  const [notes, setNotes] = useState(() => session?.notes ?? "");
  const [loggedBy, setLoggedBy] = useState(() => session?.logged_by ?? getRememberedLoggedBy());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const buyInAmount = Number(buyIn);
    const buyOutAmount = buyOut === "" ? null : Number(buyOut);
    if (
      !casino.trim() ||
      !date ||
      !loggedBy.trim() ||
      !timeIn ||
      buyIn === "" ||
      !Number.isFinite(buyInAmount) ||
      buyInAmount < 0 ||
      (buyOutAmount !== null && (!Number.isFinite(buyOutAmount) || buyOutAmount < 0))
    ) {
      setError("Date, casino, buy-in, time-in, and logged-by name are required.");
      return;
    }

    setSubmitting(true);
    setError("");
    rememberLoggedBy(loggedBy.trim());

    try {
      const fields = {
        date,
        casino: casino.trim(),
        buy_in: buyInAmount,
        buy_out: buyOutAmount,
        time_in: timeIn,
        time_out: timeOut,
        notes: notes.trim(),
        logged_by: loggedBy.trim(),
      };

      if (session) {
        await update(session.session_id, fields, session._row_version);
        router.replace(`/sessions/${session.session_id}`);
        return;
      }

      const id = await create({
        ...fields,
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
        logged_at: nowIso(),
      });

      router.push(`/sessions/${id}`);
    } catch {
      setError(
        editing
          ? "Could not save the session. Your changes were not discarded; check sync status and try again."
          : "Could not start the session. Your entry was not discarded; check sync status and try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Session date</span>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>

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
        {submitting ? (editing ? "Saving…" : "Starting…") : editing ? "Save changes" : "Start session"}
      </Button>
    </form>
  );
}
