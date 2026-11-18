"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatDateForDisplay } from "@/lib/dates";

/** Indices into the sorted list of dates; both ends included. Null = every date. */
export type DateWindow = [number, number] | null;

/** Distinct YYYY-MM-DD dates, oldest first. */
export function distinctDates(dates: string[]): string[] {
  return [...new Set(dates.filter(Boolean))].sort();
}

/**
 * State for a DateWindowBar over these dates: the window clamps itself when the dates change, and
 * `contains` says whether a date falls inside it (every date does while the window is "all").
 */
export function useDateWindow(dates: string[]) {
  const [window, setWindow] = useState<DateWindow>(null);
  const last = dates.length - 1;
  const clamped: DateWindow = window === null || last < 1 ? null : [Math.min(window[0], last), Math.min(window[1], last)];
  const full = clamped === null || (clamped[0] === 0 && clamped[1] === last);
  const from = full ? null : dates[clamped![0]];
  const to = full ? null : dates[clamped![1]];
  return {
    window: full ? null : clamped,
    setWindow,
    isAll: full,
    from,
    to,
    contains: (date: string) => full || (date >= from! && date <= to!),
  };
}

type Drag = { kind: "lo" | "hi" } | { kind: "band"; grabbedAt: number; start: [number, number] };

/**
 * A draggable window over a run of dates. Drag either end to resize it, or drag the shaded band to slide
 * the whole window along. Each step is one date that has data, so empty days are skipped.
 */
export function DateWindowBar({
  dates,
  window,
  onChange,
  label = "Dates",
}: {
  dates: string[];
  window: DateWindow;
  onChange: (window: DateWindow) => void;
  label?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const last = dates.length - 1;
  const [lo, hi] = window ?? [0, last];
  const pct = (index: number) => (last <= 0 ? 0 : (index / last) * 100);

  const set = (next: [number, number]) => {
    const a = Math.max(0, Math.min(last, next[0]));
    const b = Math.max(0, Math.min(last, next[1]));
    const sorted: [number, number] = a <= b ? [a, b] : [b, a];
    onChange(sorted[0] === 0 && sorted[1] === last ? null : sorted);
  };

  const indexAt = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * last);
  };

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const at = indexAt(event.clientX);
    const rect = track.current!.getBoundingClientRect();
    const xOf = (index: number) => rect.left + (pct(index) / 100) * rect.width;
    const nearLo = Math.abs(event.clientX - xOf(lo));
    const nearHi = Math.abs(event.clientX - xOf(hi));
    const grabRadius = 22;
    if (Math.min(nearLo, nearHi) <= grabRadius) {
      // On top of each other: pick the end that can move in the direction you're likely to drag.
      drag.current = { kind: nearLo < nearHi || (nearLo === nearHi && at <= lo && lo > 0) ? "lo" : "hi" };
    } else if (at > lo && at < hi) {
      drag.current = { kind: "band", grabbedAt: at, start: [lo, hi] };
    } else {
      // A tap outside the band moves the nearer end there.
      drag.current = { kind: at < lo ? "lo" : "hi" };
      set(at < lo ? [at, hi] : [lo, at]);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) return;
    const at = indexAt(event.clientX);
    if (current.kind === "lo") set([Math.min(at, hi), hi]);
    else if (current.kind === "hi") set([lo, Math.max(at, lo)]);
    else if (current.kind === "band") {
      const width = current.start[1] - current.start[0];
      const start = Math.max(0, Math.min(last - width, current.start[0] + at - current.grabbedAt));
      set([start, start + width]);
    }
  }

  function onKey(end: "lo" | "hi", event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    if (end === "lo") set([Math.min(lo + step, hi), hi]);
    else set([lo, Math.max(hi + step, lo)]);
  }

  const summary = useMemo(() => {
    if (last < 0) return "";
    const days = hi - lo + 1;
    return `${days} of ${dates.length} day${dates.length === 1 ? "" : "s"} played`;
  }, [dates.length, hi, lo, last]);

  if (last < 1) return null;

  const thumb = (end: "lo" | "hi", index: number) => (
    <div
      role="slider"
      tabIndex={0}
      aria-label={end === "lo" ? `${label} from` : `${label} to`}
      aria-valuemin={0}
      aria-valuemax={last}
      aria-valuenow={index}
      aria-valuetext={formatDateForDisplay(dates[index])}
      onKeyDown={(event) => onKey(end, event)}
      className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-surface-raised shadow"
      style={{ left: `${pct(index)}%` }}
    />
  );

  return (
    <section className="space-y-2 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="num text-sm font-medium text-foreground">
          {formatDateForDisplay(dates[lo])} – {formatDateForDisplay(dates[hi])}
        </p>
        {window ? (
          <button type="button" onClick={() => onChange(null)} className="min-h-9 shrink-0 text-sm font-medium text-accent">
            All time
          </button>
        ) : (
          <span className="shrink-0 text-xs text-muted">All time</span>
        )}
      </div>
      <div
        ref={track}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        className="relative h-11 touch-none select-none"
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-inset" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 cursor-grab rounded-full bg-accent/70"
          style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }}
        />
        {thumb("lo", lo)}
        {thumb("hi", hi)}
      </div>
      <p className="text-xs text-muted">{summary} · drag the ends to resize, or the bar to slide it.</p>
    </section>
  );
}
