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
import { formatMoney } from "@/lib/decimal";
import { useReimbursements } from "@/hooks/useReimbursements";
import { applyExpenses, pnlByTrip } from "@/lib/stats/tripPnl";
import { TripPnlTable } from "@/components/stats/TripPnlTable";

type View = "players" | "trips";
/** Gross results; after payroll pay; after pay and expenses (reimbursements). */
type Money = "gross" | "pay" | "net";
const MONEY_LABELS: Record<Money, string> = { gross: "Gross", pay: "After pay", net: "Net" };

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
  const { reimbursements } = useReimbursements();
  // Only people who can see everyone's pay get the after-pay views; they'd reveal other people's rates.
  const canShowPay = canSeeAllPayroll(user) && user.role !== "demo";
  const [moneyChoice, setMoney] = useState<Money>("gross");
  const money: Money = canShowPay ? moneyChoice : "gross";
  const payPeople = useMemo(() => payrollPeople(team, payrollMembers), [team, payrollMembers]);
  const dates = useMemo(() => distinctDates(allSessions.map((session) => session.date)), [allSessions]);
  const dateWindow = useDateWindow(dates);
  const { from, to } = dateWindow;
  const inWindow = useMemo(
    () => (from === null ? allSessions : allSessions.filter((session) => session.date >= from && session.date <= to!)),
    [allSessions, from, to],
  );
  const expensesInWindow = useMemo(
    () => reimbursements.filter((row) => from === null || (row.date >= from && row.date <= to!)),
    [reimbursements, from, to],
  );
  // The figures every card and the chart use: gross, less pay, and (Net) less expenses. An expense filed
  // against a session comes off that session; the rest only move the chart and the trip table.
  const { sessions, unlinkedExpenses } = useMemo(() => {
    if (money === "gross") return { sessions: inWindow, unlinkedExpenses: [] };
    const paid = sessionsAfterPay(inWindow, payPeople, payrollMembers);
    if (money === "pay") return { sessions: paid, unlinkedExpenses: [] };
    const applied = applyExpenses(paid, expensesInWindow);
    return { sessions: applied.sessions, unlinkedExpenses: applied.unlinked.map((row) => ({ ...row, amount: -row.amount })) };
  }, [money, inWindow, payPeople, payrollMembers, expensesInWindow]);
  const tripPnl = useMemo(
    () => pnlByTrip({ sessions: inWindow, reimbursements: canShowPay ? expensesInWindow : [], people: canShowPay ? payPeople : [], members: payrollMembers }),
    [inWindow, expensesInWindow, payPeople, payrollMembers, canShowPay],
  );
  const unlinkedTotal = unlinkedExpenses.reduce((sum, row) => sum - row.amount, 0);
  const [copied, setCopied] = useState<"" | "done" | "failed">("");
  async function copyForDiscord() {
    const span = from === null ? "all time" : `${formatDateForDisplay(from)} – ${formatDateForDisplay(to!)}`;
    const text = discordStatsTable({
      heading: `Stats · ${span} · ${MONEY_LABELS[money].toLowerCase()}${money === "net" && unlinkedTotal ? " (session-linked costs only)" : ""}`,
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
            {(["gross", "pay", "net"] as const).map((option) => (
              <button
                key={option}
                onClick={() => setMoney(option)}
                aria-pressed={money === option}
                className={`min-h-9 rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  money === option ? "bg-surface-raised text-foreground" : "text-muted active:text-foreground"
                }`}
              >
                {MONEY_LABELS[option]}
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
      {money !== "gross" ? (
        <p className="-mt-2 text-xs text-muted">
          Each payroll person&apos;s pay at their current rates is taken off their sessions, older ones included.
          {money === "net"
            ? unlinkedTotal
              ? ` Costs filed against a session come off that session; ${formatMoney(unlinkedTotal)} of costs not tied to a session is in the chart (Everyone) and the trip P&L, not the player cards.`
              : " Costs (reimbursements) come off the session they were filed against."
            : ""}
        </p>
      ) : null}

      {!isLoading ? <DateWindowBar days={dateWindow.days} playDates={dates} window={dateWindow.window} onChange={dateWindow.setWindow} label="Stats dates" /> : null}
      {!isLoading && sessions.length > 0 ? <PnlChart
          sessions={sessions}
          adjustments={unlinkedExpenses}
          subtitle={money === "gross" ? "Running net of finished sessions" : money === "pay" ? "Running total after pay" : "Running total after pay and costs"}
        /> : null}

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
      {!isLoading && view === "trips" ? <TripPnlTable rows={tripPnl.rows} total={tripPnl.total} showCosts={canShowPay} /> : null}
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
