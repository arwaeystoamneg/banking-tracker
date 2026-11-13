"use client";

import { useState } from "react";
import { SessionListItem } from "@/components/sessions/SessionListItem";
import { formatDateRange, formatDuration } from "@/lib/dates";
import { formatMoney } from "@/lib/decimal";
import type { Trip } from "@/lib/trips";

/** A collapsible trip: summary row you tap to reveal the individual sessions inside it. */
export function TripGroup({
  trip,
  defaultOpen = false,
  selected,
  onToggle,
}: {
  trip: Trip;
  defaultOpen?: boolean;
  /** Select mode: which sessions are picked, and how to pick one. */
  selected?: Set<string>;
  onToggle?: (sessionId: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const dateLabel = formatDateRange(trip.startDate, trip.endDate);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors active:bg-surface-raised"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{trip.name}</p>
          <p className="truncate text-xs text-muted">
            <span className="num">{dateLabel}</span> ·{" "}
            {trip.casinos.length ? `${trip.casinos.join(" · ")} · ` : ""}
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
            <p className="text-[11px] text-muted">{trip.totalMinutes > 0 ? formatDuration(trip.totalMinutes) : "net"}</p>
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
            <SessionListItem
              key={s.session_id}
              session={s}
              selected={selected?.has(s.session_id)}
              onToggle={onToggle ? () => onToggle(s.session_id) : undefined}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
