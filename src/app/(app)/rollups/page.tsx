"use client";

import { useMemo, useState } from "react";
import { useSessions } from "@/hooks/useSessions";
import { useRounds } from "@/hooks/useRounds";
import { useGames } from "@/hooks/useGames";
import { EdgeSummaryTable } from "@/components/rollups/EdgeSummaryTable";
import { computeRollup } from "@/lib/math/rollup";

export default function RollupsPage() {
  const { sessions } = useSessions();
  const { rounds, isLoading } = useRounds();
  const { games } = useGames();
  const [gameId, setGameId] = useState<string>("all");

  const sessionIdsForGame = useMemo(() => {
    if (gameId === "all") return null;
    return new Set(sessions.filter((s) => s.game_id === gameId).map((s) => s.session_id));
  }, [sessions, gameId]);

  const relevantRounds = useMemo(
    () => (sessionIdsForGame ? rounds.filter((r) => sessionIdsForGame.has(r.session_id)) : rounds),
    [rounds, sessionIdsForGame],
  );

  const rollup = useMemo(() => computeRollup(relevantRounds), [relevantRounds]);

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <h1 className="text-xl font-semibold text-foreground">Roll-ups</h1>

      <select
        value={gameId}
        onChange={(e) => setGameId(e.target.value)}
        className="h-12 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground outline-none focus:border-neutral-500"
      >
        <option value="all">All games</option>
        {games.map((g) => (
          <option key={g.game_id} value={g.game_id}>
            {g.name}
          </option>
        ))}
      </select>

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rollup.roundCount === 0 ? (
        <p className="text-sm text-muted">No logged rounds yet for this filter.</p>
      ) : (
        <EdgeSummaryTable rollup={rollup} />
      )}
    </main>
  );
}
