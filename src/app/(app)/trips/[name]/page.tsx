"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSessions } from "@/hooks/useSessions";
import { ResultStatsCard } from "@/components/stats/ResultStatsCard";
import { SessionListItem } from "@/components/sessions/SessionListItem";
import { groupSessionsIntoTrips } from "@/lib/trips";
import { sessionsByPlayer } from "@/lib/stats/resultStats";

/** One trip: its overall results, each person's results on it, and its sessions. */
export default function TripPage() {
  const params = useParams<{ name: string }>();
  const name = decodeURIComponent(params.name ?? "");
  const { sessions, isLoading } = useSessions();
  const trip = useMemo(
    () => groupSessionsIntoTrips(sessions).find((candidate) => candidate.name.toLowerCase() === name.toLowerCase()),
    [sessions, name],
  );
  const players = useMemo(() => (trip ? sessionsByPlayer(trip.sessions) : []), [trip]);

  if (isLoading) return <p className="px-4 pt-4 text-sm text-muted">Loading…</p>;
  if (!trip) {
    return (
      <main className="mx-auto max-w-lg space-y-3 px-4 pt-4">
        <p className="text-sm text-muted">No trip called “{name}”.</p>
        <Link href="/rollups" className="text-sm text-emerald-400 underline">
          Back to stats
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <div>
        <Link href="/rollups" className="text-xs text-muted underline active:text-foreground">
          ← Stats
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{trip.name}</h1>
      </div>

      <ResultStatsCard title="Whole trip" sessions={trip.sessions} breakdowns={[{ heading: "By player", rows: players }]} />

      {players.length > 1
        ? players.map((player) => <ResultStatsCard key={player.label} title={player.label} sessions={player.sessions} />)
        : null}

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Sessions · {trip.sessionCount}</h2>
        {trip.sessions.map((session) => (
          <SessionListItem key={session.session_id} session={session} />
        ))}
      </section>
    </main>
  );
}

