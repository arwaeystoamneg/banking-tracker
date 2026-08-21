"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useGames } from "@/hooks/useGames";
import { useSidebets } from "@/hooks/useSidebets";
import { usePaytables } from "@/hooks/usePaytables";
import { useFeeSchedules } from "@/hooks/useFeeSchedules";
import { EditableField } from "@/components/games/EditableField";
import { PaytableGrid } from "@/components/games/PaytableGrid";
import { FeeScheduleGrid } from "@/components/games/FeeScheduleGrid";
import { VerifiedBadge } from "@/components/games/VerifiedBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Metric } from "@/components/ui/Metric";
import { formatPercent } from "@/lib/decimal";

export default function GameDetailPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const router = useRouter();
  const { games, isLoading, update, remove: removeGame } = useGames();
  const { sidebets, isLoading: sidebetsLoading, remove: removeSidebet } = useSidebets(gameId);
  const { paytables, remove: removePaytable } = usePaytables();
  const { feeSchedules, remove: removeFeeSchedule } = useFeeSchedules(gameId);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const game = games.find((g) => g.game_id === gameId);

  if (isLoading) return <p className="px-4 pt-4 text-sm text-muted">Loading…</p>;
  if (!game) return <p className="px-4 pt-4 text-sm text-muted">Game not found (try syncing).</p>;

  function save<K extends string>(field: K) {
    return (value: string) => void update(gameId, { [field]: value } as never, game!._row_version);
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${game?.name}? Its side bets, paytables, and fee schedules will also be deleted.`)) return;

    setDeleting(true);
    setDeleteError("");
    try {
      const sidebetIds = new Set(sidebets.map((sidebet) => sidebet.sidebet_id));
      await Promise.all(paytables.filter((paytable) => sidebetIds.has(paytable.sidebet_id)).map((paytable) => removePaytable(paytable.paytable_id)));
      await Promise.all(sidebets.map((sidebet) => removeSidebet(sidebet.sidebet_id)));
      await Promise.all(feeSchedules.map((schedule) => removeFeeSchedule(schedule.schedule_id)));
      await removeGame(gameId);
      router.replace("/games");
    } catch {
      setDeleteError("Could not queue the full deletion. Check sync status before trying again.");
      setDeleting(false);
    }
  }

  const edgePositive = game.edge_pct >= 0;
  const edgeTone = !game.verified ? "warning" : edgePositive ? "positive" : "negative";
  const signedEdge = `${edgePositive ? "+" : ""}${formatPercent(game.edge_pct, 2)}`;

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 pt-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{game.name}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {game.filing ? <span className="num">{game.filing}</span> : "No filing"}
            {game.version ? ` · ${game.version}` : ""}
          </p>
        </div>
        <VerifiedBadge verified={game.verified} />
      </div>

      {/* Key figures up top — the decision-relevant numbers, before the editing surface. Edge always
          shows its base (edge_text), and an unverified edge renders in warning color. */}
      <section className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-surface p-4">
        <Metric label="Banker edge" value={signedEdge} base={game.edge_text || undefined} tone={edgeTone} size="lg" />
        <Metric label="Exposure" value={`×${game.exposure_mult}`} base="bank per $1 of action" size="lg" />
        {game.fee_text ? (
          <div className="col-span-2 border-t border-border pt-3">
            <Metric label="Collection" value={<span className="text-base">{game.fee_text}</span>} />
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Details — tap any field to edit</p>
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

      <section className="space-y-2 rounded-2xl border border-red-900/70 bg-red-950/20 p-4">
        <h2 className="text-sm font-semibold text-red-300">Delete game</h2>
        <p className="text-xs text-muted">This also removes its side bets, paytables, and fee schedules.</p>
        {deleteError ? <p className="text-xs text-red-400">{deleteError}</p> : null}
        <Button variant="danger" onClick={handleDelete} disabled={deleting} className="w-full">
          {deleting ? "Deleting…" : "Delete game"}
        </Button>
      </section>
    </main>
  );
}
