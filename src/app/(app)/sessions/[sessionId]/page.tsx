"use client";

import { RunningFor } from "@/components/sessions/RunningFor";
import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { mergedId } from "@/offline/queue";
import Link from "next/link";
import { useSessions } from "@/hooks/useSessions";
import { EndSessionCard, SessionSummaryCard } from "@/components/sessions/SessionSummaryCard";
import { Badge } from "@/components/ui/Badge";
import { SessionTagBadges, SessionTagEditor } from "@/components/sessions/SessionTags";
import { sessionTrip } from "@/lib/trips";
import { isSessionOpen, loggedOnBehalf, sessionPlayerName } from "@/lib/sessionHelpers";
import { formatDateForDisplay, formatTimeRange } from "@/lib/dates";
import { d, formatMoney } from "@/lib/decimal";
import { useCurrentUser, useTeam } from "@/components/providers/AuthProvider";
import { PayrollStatus } from "@/components/payroll/PayrollStatus";
import { payrollPeople, sessionEmployee } from "@/lib/payroll";
import { usePayrollMembers } from "@/hooks/usePayrollMembers";
import { canRequestReimbursement, canSubmitLossReport, ownsSession } from "@/lib/auth/permissions";

const LINK_BUTTON =
  "flex h-10 min-w-12 items-center rounded-xl border border-border bg-surface-raised px-4 text-sm font-medium text-foreground active:bg-neutral-800";

export default function SessionDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = useCurrentUser();
  const team = useTeam();
  const { payrollMembers } = usePayrollMembers();
  const { sessionId } = use(params);
  const { sessions, isLoading } = useSessions();

  const session = sessions.find((s) => s.session_id === sessionId);
  const router = useRouter();
  const missing = !isLoading && !session;

  // This phone's copy was merged into a session that already existed: go to that one.
  useEffect(() => {
    if (!missing) return;
    void mergedId("sessions", sessionId).then((id) => {
      if (id) router.replace(`/sessions/${id}`);
    });
  }, [missing, sessionId, router]);

  if (isLoading) return <p className="px-4 pt-4 text-sm text-muted">Loading…</p>;
  if (!session) return <p className="px-4 pt-4 text-sm text-muted">Session not found (try syncing).</p>;
  const canEdit = ownsSession(user, session);
  const open = isSessionOpen(session);
  const net = session.buy_out === null ? null : d(session.buy_out).minus(session.buy_in);

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 pt-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-foreground">{sessionPlayerName(session) || "Unknown player"}</h1>
            {open ? <Badge tone="warning">Open</Badge> : <Badge tone="accent">Closed</Badge>}
            <SessionTagBadges session={session} />
          </div>
          <p className="text-sm text-muted">
            {formatDateForDisplay(session.date)} · {formatTimeRange(session.time_in, session.time_out)}
            {open ? <RunningFor date={session.date} timeIn={session.time_in} /> : null}
          </p>
          {loggedOnBehalf(session) ? <p className="text-xs text-muted">Logged by {session.logged_by}</p> : null}
          {sessionTrip(session) ? <p className="text-xs text-muted">Trip: {sessionTrip(session)}</p> : null}
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
          {canRequestReimbursement(user) ? (
            <Link href={`/reimbursements/new?session_id=${session.session_id}`} className={LINK_BUTTON}>
              Reimburse
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
        {session.low_stack !== null || session.high_stack !== null ? (
          <p className="num col-span-3 text-xs text-muted">
            {session.low_stack !== null ? `Lowest ${formatMoney(session.low_stack)}` : ""}
            {session.low_stack !== null && session.high_stack !== null ? " · " : ""}
            {session.high_stack !== null ? `Highest ${formatMoney(session.high_stack)}` : ""}
          </p>
        ) : null}
        {session.notes ? (
          <p className="col-span-3 border-t border-border pt-2 whitespace-pre-wrap text-foreground">{session.notes}</p>
        ) : null}
      </section>

      <SessionTagEditor session={session} />

      {sessionEmployee(session, payrollPeople(team, payrollMembers)) ? <PayrollStatus session={session} /> : null}

      {open && canEdit ? <EndSessionCard session={session} /> : null}
      {open && !canEdit ? (
        <p className="text-sm text-muted">Only {sessionPlayerName(session)}, whoever logged it, or an admin can update this session.</p>
      ) : null}

      <SessionSummaryCard session={session} />
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
