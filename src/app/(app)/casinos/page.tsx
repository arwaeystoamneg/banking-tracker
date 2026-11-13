"use client";

import Link from "next/link";
import { useCasinos } from "@/hooks/useCasinos";
import { useRoomColors } from "@/hooks/useRoomColors";
import { casinoHref } from "@/lib/casinos";
import { roomDotStyle } from "@/lib/cardroomColors";
import { formatDuration } from "@/lib/dates";
import { d, formatMoney } from "@/lib/decimal";

function wholeDollars(value: number | string): string {
  return formatMoney(d(value).toDecimalPlaces(0)).replace(/\.00$/, "");
}

/** Every room at a glance: how it's gone and how many games are listed there. */
export default function CasinosPage() {
  const { casinos, isLoading } = useCasinos();
  const { colorOf } = useRoomColors();

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Casinos</h1>
          <p className="text-sm text-muted">{isLoading ? "Loading…" : `${casinos.length} room${casinos.length === 1 ? "" : "s"}`}</p>
        </div>
        <Link href="/games" className="text-sm font-medium text-muted underline underline-offset-4 active:text-foreground">
          All games
        </Link>
      </div>

      <div className="space-y-3">
        {casinos.map(({ room, stats, games }) => {
          const played = stats.completedCount > 0;
          return (
            <Link
              key={room}
              href={casinoHref(room)}
              className="block rounded-2xl border border-border bg-surface p-4 transition-colors active:border-border-strong active:bg-surface-raised"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-base font-medium text-foreground">
                    <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={roomDotStyle(colorOf(room))} />
                    <span className="truncate">{room}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {stats.completedCount} session{stats.completedCount === 1 ? "" : "s"} · {games.length} game{games.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`num text-base font-semibold ${!played ? "text-muted" : stats.net.isNegative() ? "text-red-400" : "text-emerald-400"}`}>
                    {played ? formatMoney(stats.net) : "—"}
                  </p>
                  <p className="num text-xs text-muted">
                    {stats.hourly ? `${wholeDollars(stats.hourly.toString())}/hr` : ""}
                    {stats.minutes > 0 ? ` · ${formatDuration(stats.minutes)}` : ""}
                  </p>
                  {stats.sdPerHour !== null ? <p className="num text-xs text-muted">SD {wholeDollars(stats.sdPerHour)}/hr</p> : null}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
