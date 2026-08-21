"use client";

import Link from "next/link";
import { useSessions } from "@/hooks/useSessions";
import { useLossReports } from "@/hooks/useLossReports";
import { findUnreportedLossSessions, UNREPORTED_LOSS_THRESHOLD } from "@/lib/losses";
import { formatMoney } from "@/lib/decimal";
import { formatDateForDisplay } from "@/lib/dates";
import { canonicalCasino } from "@/lib/names";

/** Sessions with a large negative gross W/L and no linked report — the unreported-loss catch. */
export function UnreportedLosses() {
  const { sessions, isLoading: sessionsLoading } = useSessions();
  const { reports, isLoading: reportsLoading } = useLossReports();

  if (sessionsLoading || reportsLoading) return null;

  const flagged = findUnreportedLossSessions(sessions, reports);
  if (flagged.length === 0) return null;

  return (
    <section className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
      <h2 className="text-sm font-semibold text-amber-300">Unreported losses</h2>
      <p className="text-xs text-amber-200/80">
        Sessions with gross W/L of −${UNREPORTED_LOSS_THRESHOLD.toLocaleString()} or worse and no
        linked loss report. This is the only check that catches a loss nobody filed.
      </p>
      <ul className="space-y-2">
        {flagged.map((session) => (
          <li key={session.session_id}>
            <Link
              href={`/losses/new?session_id=${session.session_id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-surface/60 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">
                {canonicalCasino(session.casino) || "Session"} · {formatDateForDisplay(session.date)}
              </span>
              <span className="num shrink-0 font-semibold text-red-400">{formatMoney(session.gross_wl ?? 0)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
