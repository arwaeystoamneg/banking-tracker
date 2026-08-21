"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useGames } from "@/hooks/useGames";
import { useSidebets } from "@/hooks/useSidebets";
import { usePaytables } from "@/hooks/usePaytables";
import { EditableField } from "@/components/games/EditableField";
import { SidebetCard } from "@/components/games/SidebetCard";
import { FeeScheduleGrid } from "@/components/games/FeeScheduleGrid";
import { VerifiedBadge } from "@/components/games/VerifiedBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Metric } from "@/components/ui/Metric";
import { formatPercent } from "@/lib/decimal";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { ownsGame } from "@/lib/auth/permissions";

export default function GameDetailPage({ params }: { params: Promise<{ gameId: string }> }) {
  const user = useCurrentUser();
  const { gameId } = use(params);
  const router = useRouter();
  const { games, isLoading, update, remove: removeGame } = useGames();
  const { sidebets, isLoading: sidebetsLoading, create: createSidebet } = useSidebets(gameId);
  const { paytables } = usePaytables();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const game = games.find((g) => g.game_id === gameId);

  if (isLoading) return <p className="px-4 pt-4 text-sm text-muted">Loading…</p>;
  if (!game) return <p className="px-4 pt-4 text-sm text-muted">Game not found (try syncing).</p>;
  const canEdit = ownsGame(user, game);

  function save<K extends string>(field: K) {
    return (value: string) => void update(gameId, { [field]: value } as never, game!._row_version);
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${game?.name}? Its side bets, paytables, and fee schedules will also be deleted.`)) return;

    setDeleting(true);
    setDeleteError("");
    try {
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
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {canEdit ? "Details — tap any field to edit" : "Details — view only"}
        </p>
        <EditableField label="Name" value={game.name} readOnly={!canEdit} onSave={save("name")} />
        <EditableField label="Casinos (pipe-delimited)" value={game.casinos} readOnly={!canEdit} onSave={save("casinos")} />
        <EditableField label="Version" value={game.version} readOnly={!canEdit} onSave={save("version")} />
        <EditableField label="Filing" value={game.filing} readOnly={!canEdit} onSave={save("filing")} />
        <EditableField label="Edge (text)" value={game.edge_text} readOnly={!canEdit} onSave={save("edge_text")} />
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Numeric edge (%)</span>
          <input
            defaultValue={game.edge_pct * 100}
            inputMode="decimal"
            readOnly={!canEdit}
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (canEdit && Number.isFinite(value) && value / 100 !== game.edge_pct) {
                void update(gameId, { edge_pct: value / 100 }, game._row_version);
              }
            }}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground outline-none focus:border-neutral-500"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Exposure multiple</span>
          <input
            defaultValue={game.exposure_mult}
            inputMode="decimal"
            readOnly={!canEdit}
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (canEdit && Number.isFinite(value) && value > 0 && value !== game.exposure_mult) {
                void update(gameId, { exposure_mult: value }, game._row_version);
              }
            }}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground outline-none focus:border-neutral-500"
          />
        </label>
        <label className="flex min-h-11 items-center gap-3 px-3 text-sm text-foreground">
          <input
            type="checkbox"
            checked={game.verified}
            disabled={!canEdit}
            onChange={(event) => void update(gameId, { verified: event.target.checked }, game._row_version)}
            className="h-5 w-5 accent-emerald-600"
          />
          Numeric edge verified
        </label>
        <EditableField label="Rules" value={game.rules} multiline readOnly={!canEdit} onSave={save("rules")} />
        <EditableField label="Settlement order" value={game.settlement_order} multiline readOnly={!canEdit} onSave={save("settlement_order")} />
        <EditableField label="Notes" value={game.notes} multiline readOnly={!canEdit} onSave={save("notes")} />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Side bets &amp; paytables</h2>
          <span className="text-xs text-muted">bank liability, not features</span>
        </div>
        {sidebetsLoading ? (
          <p className="text-xs text-muted">Loading…</p>
        ) : sidebets.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface/50 p-4 text-xs text-muted">
            No side bets recorded for this game.
          </p>
        ) : (
          sidebets.map((sb) => (
            <SidebetCard
              key={sb.sidebet_id}
              sidebet={sb}
              rows={paytables.filter((pt) => pt.sidebet_id === sb.sidebet_id)}
              readOnly={!canEdit}
            />
          ))
        )}
        {canEdit ? (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() =>
              void createSidebet({
                game_id: gameId,
                name: "New side bet",
                top_payout: "",
                limits: "",
                edge_pct: 0,
                verified: false,
                note: "",
              })
            }
          >
            + Add side bet
          </Button>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Fee schedule</h2>
          <Badge>Used by round logging</Badge>
        </div>
        <FeeScheduleGrid gameId={gameId} readOnly={!canEdit} />
      </section>

      {canEdit ? <section className="space-y-2 rounded-2xl border border-red-900/70 bg-red-950/20 p-4">
        <h2 className="text-sm font-semibold text-red-300">Delete game</h2>
        <p className="text-xs text-muted">This also removes its side bets, paytables, and fee schedules.</p>
        {deleteError ? <p className="text-xs text-red-400">{deleteError}</p> : null}
        <Button variant="danger" onClick={handleDelete} disabled={deleting} className="w-full">
          {deleting ? "Deleting…" : "Delete game"}
        </Button>
      </section> : null}
    </main>
  );
}
