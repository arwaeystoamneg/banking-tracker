"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCasinos } from "@/hooks/useCasinos";
import { useRoomColors } from "@/hooks/useRoomColors";
import { ResultStatsCard } from "@/components/stats/ResultStatsCard";
import { SessionListItem } from "@/components/sessions/SessionListItem";
import { GameCard } from "@/components/games/GameCard";
import { roomDotStyle } from "@/lib/cardroomColors";
import { canonicalCasino, normalizeCasinoKey } from "@/lib/names";
import { groupSessionsIntoTrips, sessionTrip } from "@/lib/trips";
import { sessionsByPlayer } from "@/lib/stats/resultStats";
import { isMainWagerSidebet, sidebetAppliesAtCasino } from "@/lib/gameFamily";
import { byPlayTimeNewestFirst } from "@/lib/sessionHelpers";

/** One room: its results (by player and trip), the games listed there, and its sessions. */
export default function CasinoPage() {
  const params = useParams<{ room: string }>();
  const wanted = normalizeCasinoKey(canonicalCasino(decodeURIComponent(params.room ?? "")));
  const { casinos, isLoading } = useCasinos();
  const { colorOf } = useRoomColors();
  const casino = casinos.find((candidate) => normalizeCasinoKey(candidate.room) === wanted);
  const byTrip = useMemo(() => {
    if (!casino) return [];
    const rows = groupSessionsIntoTrips(casino.sessions).map((trip) => ({ label: trip.name, sessions: trip.sessions }));
    const loose = casino.sessions.filter((session) => !sessionTrip(session));
    return loose.length ? [...rows, { label: "Not in a trip", sessions: loose }] : rows;
  }, [casino]);
  const sessions = useMemo(() => (casino ? [...casino.sessions].sort(byPlayTimeNewestFirst) : []), [casino]);

  if (isLoading) return <p className="px-4 pt-4 text-sm text-muted">Loading…</p>;
  if (!casino) {
    return (
      <main className="mx-auto max-w-lg space-y-3 px-4 pt-4">
        <p className="text-sm text-muted">Nothing logged for this room yet.</p>
        <Link href="/casinos" className="text-sm text-emerald-400 underline">
          Back to casinos
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <div>
        <Link href="/casinos" className="text-xs text-muted underline active:text-foreground">
          ← Casinos
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <span aria-hidden className="h-4 w-4 shrink-0 rounded-full" style={roomDotStyle(colorOf(casino.room))} />
          {casino.room}
        </h1>
      </div>

      {casino.sessions.length > 0 ? (
        <ResultStatsCard
          title="Results here"
          sessions={casino.sessions}
          hideRooms
          breakdowns={[
            { heading: "By player", rows: sessionsByPlayer(casino.sessions) },
            { heading: "By trip", rows: byTrip },
          ]}
        />
      ) : (
        <p className="text-sm text-muted">No sessions logged here yet.</p>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Games here · {casino.games.length}</h2>
        {casino.games.length === 0 ? <p className="text-sm text-muted">No games listed for this room.</p> : null}
        {casino.games.map((game) => {
          const names = game.sidebets
            .filter((sb) => !isMainWagerSidebet(sb.name) && sidebetAppliesAtCasino(sb.name, casino.room))
            .map((sb) => sb.name);
          return <GameCard key={game.game_id} game={game} hideCasinos sidebetCount={names.length} sidebetNames={names} />;
        })}
      </section>

      {sessions.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Sessions · {sessions.length}</h2>
          {sessions.map((session) => (
            <SessionListItem key={session.session_id} session={session} />
          ))}
        </section>
      ) : null}
    </main>
  );
}
