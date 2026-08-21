import Link from "next/link";
import type { Game } from "@/lib/validation/schemas";
import { formatPercent } from "@/lib/decimal";
import { canonicalCasinoList } from "@/lib/names";

/**
 * Scan card for the game list. Two comparison-critical figures get equal, aligned billing: the
 * banker **edge** (with its base) and the **exposure multiple** (what the $8k bank can actually sit
 * at). Unverified edges render in warning color — distinguishable at a glance, not on inspection —
 * and keep their hedged `edge_text` (which carries the range) visible rather than a crisp number.
 */
export function GameCard({
  game,
  sidebetCount = 0,
  maxTail = null,
}: {
  game: Game;
  sidebetCount?: number;
  /** Largest funded payout multiple across this game's side bets — worst-case bank tail per $1. */
  maxTail?: number | null;
}) {
  const positive = game.edge_pct >= 0;
  const edgeTone = !game.verified
    ? "text-amber-400"
    : positive
      ? "text-emerald-400"
      : "text-red-400";
  const signed = `${positive ? "+" : ""}${formatPercent(game.edge_pct, 2)}`;

  return (
    <Link
      href={`/games/${game.game_id}`}
      className="block rounded-2xl border border-border bg-surface p-4 transition-colors active:border-border-strong active:bg-surface-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">{game.name}</h3>
          <p className="mt-0.5 truncate text-sm text-muted">
            {game.casinos ? canonicalCasinoList(game.casinos).join(" · ") : "No casino listed"}
          </p>
        </div>
        {!game.verified ? (
          <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
            estimate
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-stretch gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Edge</p>
          <p className={`num text-lg font-semibold leading-tight ${edgeTone}`}>{signed}</p>
          {game.edge_text ? (
            <p className="mt-0.5 truncate text-xs text-muted" title={game.edge_text}>
              {game.edge_text}
            </p>
          ) : null}
        </div>
        <div className="w-px shrink-0 self-stretch bg-border" aria-hidden />
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Exposure</p>
          <p className="num text-lg font-semibold leading-tight text-foreground">×{game.exposure_mult}</p>
          <p className="mt-0.5 text-xs text-muted">bank per $1</p>
        </div>
      </div>

      {sidebetCount > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-inset px-2 py-0.5 text-muted">
            {sidebetCount} side bet{sidebetCount === 1 ? "" : "s"}
          </span>
          {maxTail !== null && maxTail >= 10 ? (
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium ${
                maxTail >= 100
                  ? "border-red-500/40 bg-red-500/10 text-red-300"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-300"
              }`}
            >
              <span aria-hidden>▲</span> tail ×{maxTail.toLocaleString()} per $1
            </span>
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}
