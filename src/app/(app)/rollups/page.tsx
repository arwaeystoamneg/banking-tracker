"use client";

import { useMemo, useState } from "react";
import { useSessions } from "@/hooks/useSessions";
import { useRounds } from "@/hooks/useRounds";
import { EdgeSummaryTable } from "@/components/rollups/EdgeSummaryTable";
import { ResultStatsCard } from "@/components/stats/ResultStatsCard";
import { computeRollup } from "@/lib/math/rollup";
import { groupSessionsIntoTrips } from "@/lib/trips";
import { canonicalPerson, normalizePersonKey } from "@/lib/names";
import { sessionPlayerName } from "@/lib/sessionHelpers";
import type { Session } from "@/lib/validation/schemas";

type View = "players" | "trips";

/** Sessions per player, credited to who played, name variants merged, alphabetical. */
function byPlayer(sessions: Session[]): { label: string; sessions: Session[] }[] {
  const groups = new Map<string, { label: string; sessions: Session[] }>();
  for (const session of sessions) {
    const name = sessionPlayerName(session);
    const key = normalizePersonKey(name);
    if (!key) continue;
    const group = groups.get(key) ?? { label: canonicalPerson(name), sessions: [] };
    group.sessions.push(session);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export default function RollupsPage() {
  const { sessions, isLoading: sessionsLoading } = useSessions();
  const { rounds, isLoading: roundsLoading } = useRounds();
  const [view, setView] = useState<View>("players");
  const players = useMemo(() => byPlayer(sessions), [sessions]);
  const trips = useMemo(() => groupSessionsIntoTrips(sessions), [sessions]);
  const roundStats = useMemo(() => computeRollup(rounds), [rounds]);
  const isLoading = sessionsLoading || roundsLoading;

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Stats</h1>
        <p className="text-sm text-muted">{view === "players" ? "All-time results for each player." : "Results for each trip."}</p>
      </div>

      <div className="inline-flex rounded-xl border border-border bg-surface p-0.5 text-sm">
        {(["players", "trips"] as const).map((option) => (
          <button
            key={option}
            onClick={() => setView(option)}
            className={`min-h-9 rounded-lg px-3 py-1.5 font-medium transition-colors ${
              view === option ? "bg-surface-raised text-foreground" : "text-muted active:text-foreground"
            }`}
          >
            {option === "players" ? "Players" : "Trips"}
          </button>
        ))}
      </div>

      {isLoading ? <p className="text-sm text-muted">Loading…</p> : null}
      {!isLoading && view === "players" ? (
        players.length === 0 ? (
          <p className="text-sm text-muted">No sessions logged yet.</p>
        ) : (
          players.map((player) => <ResultStatsCard key={player.label} title={player.label} sessions={player.sessions} />)
        )
      ) : null}
      {!isLoading && view === "trips" ? (
        trips.length === 0 ? (
          <p className="text-sm text-muted">No trips yet. Put sessions in a trip from the Sessions tab.</p>
        ) : (
          trips.map((trip) => (
            <ResultStatsCard key={trip.id} title={trip.name} sessions={trip.sessions} breakdown={byPlayer(trip.sessions)} />
          ))
        )
      ) : null}

      {!isLoading && roundStats.roundCount > 0 ? (
        <section className="space-y-2 pt-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Round analysis</h2>
            <p className="text-xs text-muted">Results from individually logged banking rounds.</p>
          </div>
          <EdgeSummaryTable rollup={roundStats} />
        </section>
      ) : null}
    </main>
  );
}
