"use client";

import { use } from "react";
import Link from "next/link";
import { useSessions } from "@/hooks/useSessions";
import { RoundLogger } from "@/components/sessions/RoundLogger";
import { SessionSummaryCard } from "@/components/sessions/SessionSummaryCard";
import { isSessionOpen } from "@/lib/sessionHelpers";
import { formatDateForDisplay } from "@/lib/dates";
import { formatMoney } from "@/lib/decimal";

export default function SessionDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { sessions, isLoading } = useSessions();

  const session = sessions.find((s) => s.session_id === sessionId);

  if (isLoading) return <p className="px-4 pt-4 text-sm text-muted">Loading…</p>;
  if (!session) return <p className="px-4 pt-4 text-sm text-muted">Session not found (try syncing).</p>;

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 pt-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{session.casino || "Casino session"}</h1>
          <p className="text-sm text-muted">
            {formatDateForDisplay(session.date)} · {session.time_in || "—"}
            {session.time_out ? `–${session.time_out}` : ""}
          </p>
        </div>
        <Link
          href={`/sessions/${session.session_id}/edit`}
          className="flex h-10 min-w-12 items-center rounded-xl border border-border bg-surface-raised px-4 text-sm font-medium text-foreground active:bg-neutral-800"
        >
          Edit
        </Link>
      </div>

      <section className="space-y-2 rounded-2xl border border-border bg-surface p-4 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-muted">Buy in</span>
          <span className="font-medium text-foreground">{formatMoney(session.buy_in)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted">Buy out</span>
          <span className="font-medium text-foreground">
            {session.buy_out === null ? "Not entered" : formatMoney(session.buy_out)}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted">Logged by</span>
          <span className="font-medium text-foreground">{session.logged_by || "—"}</span>
        </div>
        {session.notes ? <p className="border-t border-border pt-2 whitespace-pre-wrap text-foreground">{session.notes}</p> : null}
      </section>

      <SessionSummaryCard session={session} />

      {isSessionOpen(session) ? (
        <RoundLogger session={session} />
      ) : (
        <p className="text-sm text-muted">This session is closed. Rounds can no longer be logged against it.</p>
      )}
    </main>
  );
}
