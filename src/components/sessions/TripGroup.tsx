"use client";

import { useState } from "react";
import { SessionListItem } from "@/components/sessions/SessionListItem";
import { formatDateForDisplay } from "@/lib/dates";
import { formatMoney } from "@/lib/decimal";
import type { Trip } from "@/lib/trips";

/** A collapsible trip: summary row you tap to reveal the individual sessions inside it. */
export function TripGroup({ trip, defaultOpen = false }: { trip: Trip; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  const sameDay = trip.startDate === trip.endDate;
  const dateLabel = sameDay
    ? formatDateForDisplay(trip.startDate)
    : `${formatDateForDisplay(trip.startDate)} – ${formatDateForDisplay(trip.endDate)}`;
  const hours = trip.totalMinutes / 60;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors active:bg-surface-raised"
      >
        <div className="min-w-0">
          <p className="num text-sm font-semibold text-foreground">{dateLabel}</p>
          <p className="truncate text-xs text-muted">
            {trip.casinos.length ? trip.casinos.join(" · ") : "No casino"} ·{" "}
            <span className="num">{trip.sessionCount}</span> session{trip.sessionCount === 1 ? "" : "s"}
            {trip.openCount > 0 ? <span className="text-amber-400"> · {trip.openCount} open</span> : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p
              className={`num text-base font-semibold ${
                trip.completedCount === 0
                  ? "text-muted"
                  : trip.netCash.isNegative()
                    ? "text-red-400"
                    : "text-emerald-400"
              }`}
            >
              {trip.completedCount === 0 ? "—" : formatMoney(trip.netCash)}
            </p>
            <p className="text-[11px] text-muted">{hours > 0 ? `${hours.toFixed(1)}h` : "net"}</p>
          </div>
          <span
            className={`text-muted transition-transform ${open ? "rotate-90" : ""}`}
            aria-hidden
          >
            ▸
          </span>
        </div>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border bg-background/40 p-3">
          {trip.sessions.map((s) => (
            <SessionListItem key={s.session_id} session={s} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
