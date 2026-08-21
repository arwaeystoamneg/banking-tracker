"use client";

import Link from "next/link";
import { useSessions } from "@/hooks/useSessions";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { isSessionOpen } from "@/lib/sessionHelpers";
import { formatDateForDisplay } from "@/lib/dates";
import { d, formatMoney } from "@/lib/decimal";

export default function SessionsPage() {
  const { sessions, isLoading } = useSessions();

  const sorted = [...sessions].sort((a, b) => (a.logged_at < b.logged_at ? 1 : -1));

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sessions</h1>
          <p className="text-sm text-muted">
            {isLoading ? "Loading…" : `${sessions.length} logged`}
          </p>
        </div>
        <Link href="/sessions/new">
          <Button className="h-10 px-4 text-sm">+ New</Button>
        </Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted">No sessions logged yet.</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((s) => {
            const open = isSessionOpen(s);
            const cashDifference = s.buy_out === null ? null : d(s.buy_out).minus(s.buy_in);
            const coverage = s.coverage_pct;
            const underbanked = coverage !== null && coverage !== undefined && coverage < 1;
            return (
              <Link
                key={s.session_id}
                href={`/sessions/${s.session_id}`}
                className="block rounded-2xl border border-border bg-surface p-4 transition-colors active:border-border-strong active:bg-surface-raised"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-foreground">{s.casino || "Casino session"}</p>
                    <p className="text-sm text-muted">
                      <span className="num">{formatDateForDisplay(s.date)}</span> · {s.time_in || "—"}
                      {s.time_out ? `–${s.time_out}` : ""}
                    </p>
                    <p className="text-xs text-muted">Logged by {s.logged_by || "—"}</p>
                  </div>
                  {open ? <Badge tone="warning">Open</Badge> : <Badge tone="accent">Closed</Badge>}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
                  {cashDifference !== null ? (
                    <span>
                      <span className="text-xs text-muted">Net </span>
                      <span className={`num font-semibold ${cashDifference.isNegative() ? "text-red-400" : "text-emerald-400"}`}>
                        {formatMoney(cashDifference)}
                      </span>
                    </span>
                  ) : null}
                  {coverage !== null && coverage !== undefined ? (
                    <span>
                      <span className="text-xs text-muted">Coverage </span>
                      <span className={`num font-semibold ${underbanked ? "text-amber-400" : "text-muted-strong"}`}>
                        {(coverage * 100).toFixed(0)}%
                      </span>
                    </span>
                  ) : null}
                  {s.rounds_banked ? (
                    <span>
                      <span className="num font-semibold text-muted-strong">{s.rounds_banked}</span>
                      <span className="text-xs text-muted"> rounds</span>
                    </span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
