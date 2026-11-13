"use client";

import Link from "next/link";
import { formatDateForDisplay, formatDuration } from "@/lib/dates";
import { formatMoney, type Decimal } from "@/lib/decimal";
import { cardroomColor } from "@/lib/cardroomColors";
import { computeResultStats, statsByRoom, type ResultStats } from "@/lib/stats/resultStats";
import { sessionPlayerName } from "@/lib/sessionHelpers";
import type { Session } from "@/lib/validation/schemas";

function tone(value: Decimal): string {
  return value.isNegative() ? "text-red-400" : "text-emerald-400";
}

function hourlyText(stats: ResultStats): string {
  return stats.hourly === null ? "—" : `${formatMoney(stats.hourly.toDecimalPlaces(0)).replace(/\.00$/, "")}/hr`;
}

/** One person's or one trip's results: hourly first, then the figures that show how it went. */
export function ResultStatsCard({
  title,
  sessions,
  breakdown,
}: {
  title: string;
  sessions: Session[];
  /** Extra rows under the room split, like each player on a trip. */
  breakdown?: { label: string; sessions: Session[] }[];
}) {
  const stats = computeResultStats(sessions);
  const rooms = statsByRoom(sessions);
  const open = stats.sessionCount - stats.completedCount;
  const done = stats.completedCount > 0;
  const winRate = done ? Math.round((stats.winningCount / stats.completedCount) * 100) : null;
  const avgLength = done && stats.minutes > 0 ? Math.round(stats.minutes / stats.completedCount) : 0;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
          <p className="num text-xs text-muted">
            {stats.firstDate ? `${formatDateForDisplay(stats.firstDate)}–${formatDateForDisplay(stats.lastDate)}` : ""}
            {open > 0 ? <span className="text-amber-400"> · {open} open</span> : null}
          </p>
        </div>
        <div className="text-right">
          <p className={`num text-xl font-semibold ${done ? tone(stats.net) : "text-muted"}`}>{done ? formatMoney(stats.net) : "—"}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted">net</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface-inset p-3">
        <Stat label="Hourly" value={hourlyText(stats)} className={stats.hourly ? tone(stats.hourly) : undefined} />
        <Stat label="Hours played" value={stats.minutes > 0 ? formatDuration(stats.minutes) : "—"} />
        <Stat label="Win rate" value={winRate === null ? "—" : `${winRate}% (${stats.winningCount}/${stats.completedCount})`} />
        <Stat label="Avg session" value={avgLength ? formatDuration(avgLength) : "—"} />
        <SessionStat label="Best session" session={stats.best} />
        <SessionStat label="Worst session" session={stats.worst} />
        <Stat
          label="Worst drawdown"
          value={!done ? "—" : stats.maxDrawdown.isZero() ? "None" : formatMoney(stats.maxDrawdown.negated())}
          className={stats.maxDrawdown.isZero() ? undefined : "text-red-400"}
          hint="Biggest drop from a high point"
        />
        <Stat label="Sessions" value={String(stats.sessionCount)} />
      </div>

      {rooms.length > 1 || (rooms.length === 1 && rooms[0].room !== "No room") ? (
        <Breakdown
          heading="By cardroom"
          rows={rooms.map((room) => ({
            key: room.room,
            label: room.room,
            dot: room.room === "No room" || room.room === "Several rooms" ? null : cardroomColor(room.room).dot,
            stats: room,
          }))}
        />
      ) : null}
      {breakdown && breakdown.length > 1 ? (
        <Breakdown
          heading="By player"
          rows={breakdown.map((row) => ({ key: row.label, label: row.label, dot: null, stats: computeResultStats(row.sessions) }))}
        />
      ) : null}
    </section>
  );
}

function Breakdown({
  heading,
  rows,
}: {
  heading: string;
  rows: { key: string; label: string; dot: string | null; stats: ResultStats }[];
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{heading}</p>
      <div className="divide-y divide-border rounded-xl border border-border bg-surface-inset">
        {rows.map(({ key, label, dot, stats }) => (
          <div key={key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              {dot ? <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} /> : null}
              <span className="truncate text-foreground">{label}</span>
              <span className="num shrink-0 text-xs text-muted">{stats.minutes > 0 ? formatDuration(stats.minutes) : `${stats.completedCount}×`}</span>
            </span>
            <span className="num shrink-0 text-right">
              <span className={`font-semibold ${stats.completedCount ? tone(stats.net) : "text-muted"}`}>
                {stats.completedCount ? formatMoney(stats.net) : "—"}
              </span>
              <span className="block text-xs text-muted">{hourlyText(stats)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, className, hint }: { label: string; value: string; className?: string; hint?: string }) {
  return (
    <div title={hint}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`num text-base font-semibold ${className ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

function SessionStat({ label, session }: { label: string; session: Session | null }) {
  if (!session || session.buy_out === null) return <Stat label={label} value="—" />;
  const net = formatMoney(session.buy_out - session.buy_in);
  return (
    <Link href={`/sessions/${session.session_id}`} className="block rounded-lg active:bg-surface-raised">
      <p className="text-xs text-muted">{label}</p>
      <p className={`num text-base font-semibold ${session.buy_out - session.buy_in < 0 ? "text-red-400" : "text-emerald-400"}`}>{net}</p>
      <p className="truncate text-[11px] text-muted">
        {sessionPlayerName(session)} · {formatDateForDisplay(session.date)}
      </p>
    </Link>
  );
}
