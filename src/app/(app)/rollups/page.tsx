"use client";

import { useMemo, useState } from "react";
import { useSessions } from "@/hooks/useSessions";
import { useRounds } from "@/hooks/useRounds";
import { EdgeSummaryTable } from "@/components/rollups/EdgeSummaryTable";
import { ResultStatsCard } from "@/components/stats/ResultStatsCard";
import { PnlChart } from "@/components/stats/PnlChart";
import { computeRollup } from "@/lib/math/rollup";
import { groupSessionsIntoTrips, sessionTrip, tripHref } from "@/lib/trips";
import { sessionsByPlayer } from "@/lib/stats/resultStats";
import type { Session } from "@/lib/validation/schemas";
import { DateWindowBar, distinctDates, useDateWindow } from "@/components/ui/DateWindowBar";
import { usePayrollMembers } from "@/hooks/usePayrollMembers";
import { useCurrentUser, useTeam } from "@/components/providers/AuthProvider";
import { canSeeAllPayroll, payrollPeople } from "@/lib/payroll";
import { sessionsAfterPay } from "@/lib/overtime";
import { sdPrior } from "@/lib/stats/resultStats";
import { discordStatsTable } from "@/lib/stats/discord";
import { formatDateForDisplay } from "@/lib/dates";

type View = "players" | "trips";

/** A player's sessions per trip, most recent trip first, then any not in a trip. */
function byTrip(sessions: Session[]): { label: string; sessions: Session[] }[] {
  const rows = groupSessionsIntoTrips(sessions).map((trip) => ({ label: trip.name, sessions: trip.sessions }));
  const loose = sessions.filter((session) => !sessionTrip(session));
  return loose.length ? [...rows, { label: "Not in a trip", sessions: loose }] : rows;
}

export default function RollupsPage() {
  const { sessions: allSessions, isLoading: sessionsLoading } = useSessions();
  const { rounds: allRounds, isLoading: roundsLoading } = useRounds();
  const [view, setView] = useState<View>("players");
  const user = useCurrentUser();
  const team = useTeam();
  const { payrollMembers } = usePayrollMembers();
  // Only people who can see everyone's pay get the after-pay view; it would reveal other people's rates.
  const canShowPay = canSeeAllPayroll(user) && user.role !== "demo";
  const [afterPay, setAfterPay] = useState(false);
  const showAfterPay = canShowPay && afterPay;
  const payPeople = useMemo(() => payrollPeople(team, payrollMembers), [team, payrollMembers]);
  const dates = useMemo(() => distinctDates(allSessions.map((session) => session.date)), [allSessions]);
  const dateWindow = useDateWindow(dates);
  const { from, to } = dateWindow;
  const sessions = useMemo(() => {
    const inWindow = from === null ? allSessions : allSessions.filter((session) => session.date >= from && session.date <= to!);
    return showAfterPay ? sessionsAfterPay(inWindow, payPeople, payrollMembers) : inWindow;
  }, [allSessions, from, to, showAfterPay, payPeople, payrollMembers]);
  const [copied, setCopied] = useState<"" | "done" | "failed">("");
  async function copyForDiscord() {
    const span = from === null ? "all time" : `${formatDateForDisplay(from)} – ${formatDateForDisplay(to!)}`;
    const text = discordStatsTable({
      heading: `Stats · ${span} · ${showAfterPay ? "after pay" : "before pay"}`,
      players: sessionsByPlayer(sessions),
      prior: sdPrior(allSessions),
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied(""), 2500);
  }
  const rounds = useMemo(() => {
    if (from === null) return allRounds;
    const ids = new Set(sessions.map((session) => session.session_id));
    return allRounds.filter((round) => ids.has(round.session_id));
  }, [allRounds, sessions, from]);
  const players = useMemo(() => sessionsByPlayer(sessions), [sessions]);
  const trips = useMemo(() => groupSessionsIntoTrips(sessions), [sessions]);
  const roundStats = useMemo(() => computeRollup(rounds), [rounds]);
  const isLoading = sessionsLoading || roundsLoading;

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Stats</h1>
        <p className="text-sm text-muted">{view === "players"
            ? dateWindow.isAll
              ? "All-time results for each player."
              : "Results for each player in the dates below."
            : dateWindow.isAll
              ? "Results for each trip."
              : "Each trip's sessions in the dates below."}</p>
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

      <div className="flex flex-wrap items-center gap-2">
        {canShowPay ? (
          <div className="inline-flex rounded-xl border border-border bg-surface p-0.5 text-sm">
            {([false, true] as const).map((option) => (
              <button
                key={String(option)}
                onClick={() => setAfterPay(option)}
                aria-pressed={afterPay === option}
                className={`min-h-9 rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  afterPay === option ? "bg-surface-raised text-foreground" : "text-muted active:text-foreground"
                }`}
              >
                {option ? "After pay" : "Before pay"}
              </button>
            ))}
          </div>
        ) : null}
        {!isLoading && sessions.length > 0 ? (
          <button
            type="button"
            onClick={() => void copyForDiscord()}
            className="min-h-10 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground active:bg-surface-raised"
          >
            {copied === "done" ? "Copied ✓" : copied === "failed" ? "Couldn't copy" : "Copy for Discord"}
          </button>
        ) : null}
      </div>
      {showAfterPay ? (
        <p className="-mt-2 text-xs text-muted">Each payroll person&apos;s pay at their current rates is taken off their sessions, older ones included.</p>
      ) : null}

      {!isLoading ? <DateWindowBar days={dateWindow.days} playDates={dates} window={dateWindow.window} onChange={dateWindow.setWindow} label="Stats dates" /> : null}
      {!isLoading && sessions.length > 0 ? <PnlChart sessions={sessions} /> : null}

      {isLoading ? <p className="text-sm text-muted">Loading…</p> : null}
      {!isLoading && view === "players" ? (
        players.length === 0 ? (
          <p className="text-sm text-muted">No sessions logged yet.</p>
        ) : (
          players.map((player) => (
            <ResultStatsCard
              key={player.label}
              title={player.label}
              sessions={player.sessions}
              breakdowns={[{ heading: "By trip", rows: byTrip(player.sessions) }]}
            />
          ))
        )
      ) : null}
      {!isLoading && view === "trips" ? (
        trips.length === 0 ? (
          <p className="text-sm text-muted">No trips yet. Put sessions in a trip from the Sessions tab.</p>
        ) : (
          trips.map((trip) => (
            <ResultStatsCard key={trip.id} title={trip.name} href={tripHref(trip.name)} sessions={trip.sessions} breakdowns={[{ heading: "By player", rows: sessionsByPlayer(trip.sessions) }]} />
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
