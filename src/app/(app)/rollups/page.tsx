"use client";

import { useMemo } from "react";
import { useSessions } from "@/hooks/useSessions";
import { useRounds } from "@/hooks/useRounds";
import { EdgeSummaryTable } from "@/components/rollups/EdgeSummaryTable";
import { computeRollup } from "@/lib/math/rollup";
import { computePersonStats } from "@/lib/stats/personStats";
import { formatDateForDisplay } from "@/lib/dates";
import { formatMoney } from "@/lib/decimal";

export default function RollupsPage() {
  const { sessions, isLoading: sessionsLoading } = useSessions();
  const { rounds, isLoading: roundsLoading } = useRounds();
  const people = useMemo(() => computePersonStats(sessions), [sessions]);
  const roundStats = useMemo(() => computeRollup(rounds), [rounds]);
  const isLoading = sessionsLoading || roundsLoading;

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Stats</h1>
        <p className="text-sm text-muted">All-time session totals grouped by the name entered in Logged by.</p>
      </div>

      {isLoading ? <p className="text-sm text-muted">Loading…</p> : null}
      {!isLoading && people.length === 0 ? <p className="text-sm text-muted">No sessions logged yet.</p> : null}

      {!isLoading
        ? people.map((person) => {
            const openCount = person.sessionCount - person.completedCount;
            const winRate = person.completedCount === 0 ? null : (person.winningCount / person.completedCount) * 100;
            return (
              <section key={person.name.toLocaleLowerCase()} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">{person.name}</h2>
                    <p className="text-xs text-muted">
                      {formatDateForDisplay(person.firstDate)}–{formatDateForDisplay(person.lastDate)}
                    </p>
                  </div>
                  <p className={`text-lg font-semibold ${person.netCash.isNegative() ? "text-red-400" : "text-emerald-400"}`}>
                    {formatMoney(person.netCash)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Sessions" value={String(person.sessionCount)} />
                  <Stat label="Completed" value={String(person.completedCount)} />
                  <Stat label="Still open" value={String(openCount)} />
                  <Stat label="Win rate" value={winRate === null ? "—" : `${winRate.toFixed(1)}%`} />
                  <Stat label="Total buy-in" value={formatMoney(person.totalBuyIn)} />
                  <Stat label="Total buy-out" value={formatMoney(person.totalBuyOut)} />
                  <Stat label="Average result" value={person.averageNet === null ? "—" : formatMoney(person.averageNet)} />
                  <Stat label="Hours recorded" value={(person.totalMinutes / 60).toFixed(1)} />
                </div>
              </section>
            );
          })
        : null}

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}
