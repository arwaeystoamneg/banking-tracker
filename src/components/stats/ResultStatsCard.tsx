"use client";

import Link from "next/link";
import { formatDateForDisplay, formatDuration } from "@/lib/dates";
import { d, formatMoney, type Decimal } from "@/lib/decimal";
import { roomDotStyle } from "@/lib/cardroomColors";
import { useRoomColors } from "@/hooks/useRoomColors";
import { computeResultStats, statsByRoom, type ResultStats } from "@/lib/stats/resultStats";
import { sessionPlayerName } from "@/lib/sessionHelpers";
import type { Session } from "@/lib/validation/schemas";

function tone(value: Decimal): string {
  return value.isNegative() ? "text-red-400" : "text-emerald-400";
}

function wholeDollars(value: Decimal.Value): string {
  return formatMoney(d(value).toDecimalPlaces(0)).replace(/\.00$/, "");
}

function hourlyText(stats: ResultStats): string {
  return stats.hourly === null ? "—" : `${formatMoney(stats.hourly.toDecimalPlaces(0)).replace(/\.00$/, "")}/hr`;
}

/** One person's or one trip's results: hourly first, then the figures that show how it went. */
export function ResultStatsCard({
  title,
  sessions,
  breakdowns = [],
  href,
  hideRooms = false,
}: {
  /** Leave out the cardroom split, e.g. on a single room's page. */
  hideRooms?: boolean;
  title: string;
  /** Makes the title a link, e.g. to a trip's own page. */
  href?: string;
  sessions: Session[];
  /** Extra splits under the room split, like each player on a trip or each trip for a player. */
  breakdowns?: { heading: string; rows: { label: string; sessions: Session[] }[] }[];
}) {
  const { colorOf } = useRoomColors();
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
          <h2 className="truncate text-base font-semibold text-foreground">
            {href ? (
              <Link href={href} className="underline decoration-border-strong underline-offset-4 active:text-muted">
                {title} ›
              </Link>
            ) : (
              title
            )}
          </h2>
          <p className="num text-xs text-muted">
            {stats.firstDate ? `${formatDateForDisplay(stats.firstDate)}–${formatDateForDisplay(stats.lastDate)}` : ""}
            {" · "}
            {stats.sessionCount} session{stats.sessionCount === 1 ? "" : "s"}
            {open > 0 ? <span className="text-amber-400"> · {open} open</span> : null}
          </p>
        </div>
        <div className="text-right">
          <p className={`num text-xl font-semibold ${done ? tone(stats.net) : "text-muted"}`}>{done ? formatMoney(stats.net) : "—"}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted">net</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface-inset p-3">
        <Stat
          label="Hourly"
          value={hourlyText(stats)}
          className={stats.hourly ? tone(stats.hourly) : undefined}
          note={stats.hourlyRange ? `likely ${wholeDollars(stats.hourlyRange[0])} to ${wholeDollars(stats.hourlyRange[1])}` : undefined}
          hint="95% range for the true hourly, given the hours played"
        />
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
        <Stat
          label="Std dev / hr"
          value={stats.sdPerHour === null ? "—" : `${wholeDollars(stats.sdPerHour)}/hr`}
          hint="How much an hour's result typically swings around the hourly"
        />
      </div>

      {!hideRooms && (rooms.length > 1 || (rooms.length === 1 && rooms[0].room !== "No room")) ? (
        <Breakdown
          heading="By cardroom"
          showSd
          rows={rooms.map((room) => ({
            key: room.room,
            label: room.room,
            dot: room.room === "No room" || room.room === "Several rooms" ? null : colorOf(room.room),
            stats: room,
          }))}
        />
      ) : null}
      {breakdowns
        .filter(({ rows }) => rows.length > 1)
        .map(({ heading, rows }) => (
          <Breakdown
            key={heading}
            heading={heading}
            rows={rows.map((row) => ({ key: row.label, label: row.label, dot: null, stats: computeResultStats(row.sessions) }))}
          />
        ))}
    </section>
  );
}

function Breakdown({
  heading,
  rows,
  showSd = false,
}: {
  heading: string;
  /** Adds each row's std dev per hour next to its hourly. */
  showSd?: boolean;
  rows: { key: string; label: string; dot: string | null; stats: ResultStats }[];
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{heading}</p>
      <div className="divide-y divide-border rounded-xl border border-border bg-surface-inset">
        {rows.map(({ key, label, dot, stats }) => (
          <div key={key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              {dot ? <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={roomDotStyle(dot)} /> : null}
              <span className="truncate text-foreground">{label}</span>
              <span className="num shrink-0 text-xs text-muted">{stats.minutes > 0 ? formatDuration(stats.minutes) : `${stats.completedCount}×`}</span>
            </span>
            <span className="num shrink-0 text-right">
              <span className={`font-semibold ${stats.completedCount ? tone(stats.net) : "text-muted"}`}>
                {stats.completedCount ? formatMoney(stats.net) : "—"}
              </span>
              <span className="block text-xs text-muted">
                {hourlyText(stats)}
                {showSd && stats.sdPerHour !== null ? ` · SD ${wholeDollars(stats.sdPerHour)}/hr` : ""}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, className, hint, note }: { label: string; value: string; className?: string; hint?: string; note?: string }) {
  return (
    <div title={hint}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`num text-base font-semibold ${className ?? "text-foreground"}`}>{value}</p>
      {note ? <p className="num truncate text-[11px] text-muted">{note}</p> : null}
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
