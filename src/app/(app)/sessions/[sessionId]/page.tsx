"use client";

import { use } from "react";
import Link from "next/link";
import { useSessions } from "@/hooks/useSessions";
import { useRounds } from "@/hooks/useRounds";
import { RoundLogger } from "@/components/sessions/RoundLogger";
import { CashOutCard, SessionSummaryCard } from "@/components/sessions/SessionSummaryCard";
import { Badge } from "@/components/ui/Badge";
import { isSessionOpen, loggedOnBehalf, sessionPlayerName } from "@/lib/sessionHelpers";
import { formatDateForDisplay } from "@/lib/dates";
import { d, formatMoney } from "@/lib/decimal";
import { canonicalCasino } from "@/lib/names";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { canSubmitLossReport, ownsSession } from "@/lib/auth/permissions";

const LINK_BUTTON =
  "flex h-10 min-w-12 items-center rounded-xl border border-border bg-surface-raised px-4 text-sm font-medium text-foreground active:bg-neutral-800";

export default function SessionDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = useCurrentUser();
  const { sessionId } = use(params);
  const { sessions, isLoading } = useSessions();
  const { rounds } = useRounds(sessionId);

  const session = sessions.find((s) => s.session_id === sessionId);

  if (isLoading) return <p className="px-4 pt-4 text-sm text-muted">Loading…</p>;
  if (!session) return <p className="px-4 pt-4 text-sm text-muted">Session not found (try syncing).</p>;
  const canEdit = ownsSession(user, session);
  const open = isSessionOpen(session);
  const net = session.buy_out === null ? null : d(session.buy_out).minus(session.buy_in);

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 pt-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-foreground">{sessionPlayerName(session) || "Unknown player"}</h1>
            {open ? <Badge tone="warning">Open</Badge> : <Badge tone="accent">Closed</Badge>}
          </div>
          <p className="text-sm text-muted">
            {session.casino ? canonicalCasino(session.casino) : "No casino"} · {formatDateForDisplay(session.date)} ·{" "}
            {session.time_in || "—"}
            {session.time_out ? `–${session.time_out}` : ""}
          </p>
          {loggedOnBehalf(session) ? <p className="text-xs text-muted">Logged by {session.logged_by}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {canEdit ? (
            <Link href={`/sessions/${session.session_id}/edit`} className={LINK_BUTTON}>
              Edit
            </Link>
          ) : null}
          {canSubmitLossReport(user) ? (
            <Link href={`/losses/new?session_id=${session.session_id}`} className={LINK_BUTTON}>
              Report loss
            </Link>
          ) : null}
        </div>
      </div>

      <section className="grid grid-cols-3 gap-3 rounded-2xl border border-border bg-surface p-4 text-sm">
        <Figure label="Buy in" value={formatMoney(session.buy_in)} />
        <Figure label="Buy out" value={session.buy_out === null ? "—" : formatMoney(session.buy_out)} />
        <Figure
          label="Result"
          value={net === null ? "—" : formatMoney(net)}
          tone={net === null ? undefined : net.isNegative() ? "text-red-400" : "text-emerald-400"}
        />
        {session.notes ? (
          <p className="col-span-3 border-t border-border pt-2 whitespace-pre-wrap text-foreground">{session.notes}</p>
        ) : null}
      </section>

      {open && canEdit ? <CashOutCard session={session} /> : null}
      {open && !canEdit ? (
        <p className="text-sm text-muted">Only {sessionPlayerName(session)}, whoever logged it, or an admin can update this session.</p>
      ) : null}

      <SessionSummaryCard session={session} />

      {open && canEdit ? (
        <details className="group rounded-2xl border border-border bg-surface" open={rounds.length > 0 || Boolean(session.game_id)}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-muted-strong">
            <span>
              Log rounds <span className="font-normal text-muted">(optional)</span>
            </span>
            <span className="text-muted transition-transform group-open:rotate-90" aria-hidden>
              ▸
            </span>
          </summary>
          <div className="border-t border-border p-3">
            <RoundLogger session={session} />
          </div>
        </details>
      ) : null}
    </main>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`num text-base font-semibold ${tone ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}
