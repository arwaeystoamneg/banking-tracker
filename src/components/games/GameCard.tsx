import Link from "next/link";
import type { Game } from "@/lib/validation/schemas";
import { VerifiedBadge } from "@/components/games/VerifiedBadge";
import { formatPercent } from "@/lib/decimal";

export function GameCard({ game }: { game: Game }) {
  return (
    <Link
      href={`/games/${game.game_id}`}
      className="block rounded-2xl border border-border bg-surface p-4 active:bg-surface-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">{game.name}</h3>
          <p className="mt-0.5 text-sm text-muted">{game.casinos || "No casino listed"}</p>
        </div>
        <VerifiedBadge verified={game.verified} />
      </div>
      <div className="mt-3 flex items-center gap-4 text-sm text-muted">
        <span>Edge {formatPercent(game.edge_pct)}</span>
        <span>Exposure ×{game.exposure_mult}</span>
      </div>
    </Link>
  );
}
