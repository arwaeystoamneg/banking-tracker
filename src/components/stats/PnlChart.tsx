"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { formatDateForDisplay } from "@/lib/dates";
import { cumulativePnl, sessionsByPlayer } from "@/lib/stats/resultStats";
import type { Session } from "@/lib/validation/schemas";

const HEIGHT = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 52 };

function money(value: number): string {
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  return abs >= 10000 ? `${sign}$${Math.round(abs / 1000)}k` : abs >= 1000 ? `${sign}$${(abs / 1000).toFixed(1)}k` : `${sign}$${Math.round(abs)}`;
}

function exact(value: number): string {
  return `${value < 0 ? "−" : value > 0 ? "+" : ""}$${Math.abs(Math.round(value)).toLocaleString("en-US")}`;
}

/** About four round-numbered ticks covering [min, max]. */
function niceTicks(min: number, max: number): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

const dayMs = (date: string) => Date.parse(`${date}T00:00:00Z`);

/**
 * Running net over time for the sessions given (the Stats page passes the ones inside its date window).
 * Chips pick whose sessions count: everyone together, or one player.
 */
export function PnlChart({
  sessions,
  adjustments = [],
  subtitle = "Running net of finished sessions",
}: {
  sessions: Session[];
  /** Dated amounts not tied to a session (expenses); counted for "Everyone" only, since they're nobody's own. */
  adjustments?: { date: string; amount: number }[];
  subtitle?: string;
}) {
  const players = useMemo(() => sessionsByPlayer(sessions), [sessions]);
  const [who, setWho] = useState<string>("");
  const chosen = players.find((player) => player.label === who);
  const points = useMemo(
    () => (chosen ? cumulativePnl(chosen.sessions) : cumulativePnl(sessions, adjustments)),
    [chosen, sessions, adjustments],
  );

  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (points.length === 0 || width === 0) return null;
    const x0 = dayMs(points[0].date);
    const x1 = dayMs(points[points.length - 1].date);
    const totals = [0, ...points.map((point) => point.total)];
    const ticks = niceTicks(Math.min(...totals), Math.max(...totals));
    const yMin = Math.min(ticks[0], ...totals);
    const yMax = Math.max(ticks[ticks.length - 1], ...totals);
    const plotW = width - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const x = (date: string) => PAD.left + (x1 === x0 ? plotW / 2 : ((dayMs(date) - x0) / (x1 - x0)) * plotW);
    const y = (value: number) => PAD.top + (yMax === yMin ? plotH / 2 : ((yMax - value) / (yMax - yMin)) * plotH);
    const xy = points.map((point) => [x(point.date), y(point.total)] as const);
    // A step line: the total holds flat between play days and jumps on them. It starts from zero so the
    // first day's result shows as a move, not a starting level.
    const path = `M${xy[0][0]},${y(0)} ` + xy.map(([px, py], i) => (i === 0 ? `V${py}` : `H${px} V${py}`)).join(" ");
    return { ticks, xy, path, y, plotW };
  }, [points, width]);

  function onMove(event: PointerEvent<SVGSVGElement>) {
    if (!geometry) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    let best = 0;
    geometry.xy.forEach(([x], index) => {
      if (Math.abs(x - px) < Math.abs(geometry.xy[best][0] - px)) best = index;
    });
    setHover(best);
  }

  const last = points[points.length - 1];
  const shown = hover !== null && points[hover] ? hover : null;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">P&amp;L over time</h2>
          <p className="text-xs text-muted">{subtitle}{chosen ? ` · ${chosen.label}` : ""}</p>
        </div>
        {last ? (
          <p className={`num text-right text-lg font-semibold ${last.total < 0 ? "text-red-400" : "text-emerald-400"}`}>{exact(last.total)}</p>
        ) : null}
      </div>

      {players.length > 1 ? (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 text-sm">
          {[{ label: "" }, ...players].map((player) => (
            <button
              key={player.label || "all"}
              type="button"
              onClick={() => setWho(player.label)}
              aria-pressed={who === player.label}
              className={`min-h-9 shrink-0 rounded-full border px-3 font-medium ${
                who === player.label ? "border-accent/70 bg-surface-raised text-foreground" : "border-border text-muted active:text-foreground"
              }`}
            >
              {player.label || "Everyone"}
            </button>
          ))}
        </div>
      ) : null}

      <div ref={box} className="relative">
        {points.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No finished sessions in these dates.</p>
        ) : geometry ? (
          <>
            <svg
              width={width}
              height={HEIGHT}
              role="img"
              aria-label={`Running net from ${formatDateForDisplay(points[0].date)} to ${formatDateForDisplay(last.date)}, ending at ${exact(last.total)}`}
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setHover(null)}
              className="block touch-pan-y select-none"
            >
              {geometry.ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={geometry.y(tick)}
                    y2={geometry.y(tick)}
                    stroke="var(--border)"
                    strokeWidth={1}
                    strokeDasharray={tick === 0 ? undefined : "2 4"}
                  />
                  <text x={PAD.left - 6} y={geometry.y(tick)} dy="0.35em" textAnchor="end" fontSize={11} fill="var(--muted)" className="num">
                    {money(tick)}
                  </text>
                </g>
              ))}
              <text x={PAD.left} y={HEIGHT - 6} fontSize={11} fill="var(--muted)">
                {formatDateForDisplay(points[0].date)}
              </text>
              <text x={width - PAD.right} y={HEIGHT - 6} fontSize={11} fill="var(--muted)" textAnchor="end">
                {formatDateForDisplay(last.date)}
              </text>
              <path d={geometry.path} fill="none" stroke="var(--t-accent, var(--accent))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {shown !== null ? (
                <>
                  <line
                    x1={geometry.xy[shown][0]}
                    x2={geometry.xy[shown][0]}
                    y1={PAD.top}
                    y2={HEIGHT - PAD.bottom}
                    stroke="var(--muted)"
                    strokeWidth={1}
                  />
                  <circle cx={geometry.xy[shown][0]} cy={geometry.xy[shown][1]} r={5} fill="var(--t-accent, var(--accent))" stroke="var(--surface)" strokeWidth={2} />
                </>
              ) : null}
            </svg>
            {shown !== null ? (
              <div
                className="pointer-events-none absolute top-0 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-xs shadow"
                style={
                  geometry.xy[shown][0] > width / 2
                    ? { right: width - geometry.xy[shown][0] + 8 }
                    : { left: geometry.xy[shown][0] + 8 }
                }
              >
                <p className="font-medium text-foreground">{formatDateForDisplay(points[shown].date)}</p>
                <p className="num text-muted">
                  Day <span className="text-foreground">{exact(points[shown].day)}</span>
                  {points[shown].sessions > 1 ? ` · ${points[shown].sessions} sessions` : ""}
                </p>
                <p className="num text-muted">
                  Total <span className="text-foreground">{exact(points[shown].total)}</span>
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ height: HEIGHT }} />
        )}
      </div>
    </section>
  );
}
