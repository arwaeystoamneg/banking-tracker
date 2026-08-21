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
