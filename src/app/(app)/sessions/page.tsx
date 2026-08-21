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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Sessions</h1>
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
            return (
              <Link
                key={s.session_id}
                href={`/sessions/${s.session_id}`}
                className="block rounded-2xl border border-border bg-surface p-4 active:bg-surface-raised"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-medium text-foreground">{s.casino || "Casino session"}</p>
                    <p className="text-sm text-muted">
                      {formatDateForDisplay(s.date)} · {s.time_in || "—"}
                      {s.time_out ? `–${s.time_out}` : ""}
                    </p>
                    <p className="text-xs text-muted">Logged by {s.logged_by || "—"}</p>
                  </div>
                  {open ? <Badge tone="warning">Open</Badge> : <Badge tone="accent">Closed</Badge>}
                </div>
                {cashDifference !== null ? (
                  <p className={`mt-2 text-sm font-medium ${cashDifference.isNegative() ? "text-red-400" : "text-emerald-400"}`}>
                    Cash difference {formatMoney(cashDifference)}
                  </p>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
