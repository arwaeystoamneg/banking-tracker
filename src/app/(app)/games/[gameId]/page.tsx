"use client";

import { use } from "react";
import { useGames } from "@/hooks/useGames";
import { useSidebets } from "@/hooks/useSidebets";
import { EditableField } from "@/components/games/EditableField";
import { PaytableGrid } from "@/components/games/PaytableGrid";
import { FeeScheduleGrid } from "@/components/games/FeeScheduleGrid";
import { VerifiedBadge } from "@/components/games/VerifiedBadge";
import { Badge } from "@/components/ui/Badge";

export default function GameDetailPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const { games, isLoading, update } = useGames();
  const { sidebets, isLoading: sidebetsLoading } = useSidebets(gameId);

  const game = games.find((g) => g.game_id === gameId);

  if (isLoading) return <p className="px-4 pt-4 text-sm text-muted">Loading…</p>;
  if (!game) return <p className="px-4 pt-4 text-sm text-muted">Game not found (try syncing).</p>;

  function save<K extends string>(field: K) {
    return (value: string) => void update(gameId, { [field]: value } as never, game!._row_version);
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 pt-4 pb-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">{game.name}</h1>
        <VerifiedBadge verified={game.verified} />
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <EditableField label="Name" value={game.name} onSave={save("name")} />
        <EditableField label="Casinos (pipe-delimited)" value={game.casinos} onSave={save("casinos")} />
        <EditableField label="Version" value={game.version} onSave={save("version")} />
        <EditableField label="Filing" value={game.filing} onSave={save("filing")} />
        <EditableField label="Edge (text)" value={game.edge_text} onSave={save("edge_text")} />
        <EditableField label="Rules" value={game.rules} multiline onSave={save("rules")} />
        <EditableField label="Settlement order" value={game.settlement_order} multiline onSave={save("settlement_order")} />
        <EditableField label="Notes" value={game.notes} multiline onSave={save("notes")} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Side bets &amp; paytables</h2>
        {sidebetsLoading ? (
          <p className="text-xs text-muted">Loading…</p>
        ) : (
          sidebets.map((sb) => (
            <div key={sb.sidebet_id} className="space-y-2 rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-foreground">{sb.name}</h3>
                <VerifiedBadge verified={sb.verified} />
              </div>
              {sb.note ? <p className="text-xs text-amber-400">{sb.note}</p> : null}
              <PaytableGrid sidebetId={sb.sidebet_id} />
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Fee schedule</h2>
          <Badge>Used by the fee calculator</Badge>
        </div>
        <FeeScheduleGrid gameId={gameId} />
      </section>
    </main>
  );
}
