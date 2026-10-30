"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSessions } from "@/hooks/useSessions";
import { usePayrollMembers } from "@/hooks/usePayrollMembers";
import { PaySwitcher } from "@/components/payroll/PaySwitcher";
import { OvertimeControl } from "@/components/payroll/OvertimeControl";
import { useCurrentUser, useTeam } from "@/components/providers/AuthProvider";
import { canMarkPayrollPaid, canSeeAllPayroll, formatHours, payrollPeople, sessionHours } from "@/lib/payroll";
import { formatDateForDisplay } from "@/lib/dates";
import { formatMoney } from "@/lib/decimal";
import { formatMinutes, overtimeByPerson, ratesFor, sessionPay, totalPay, type PayRates, type PersonOvertime } from "@/lib/overtime";
import type { Session } from "@/lib/validation/schemas";

export default function OvertimePage() {
  const user = useCurrentUser();
  const team = useTeam();
  const { sessions, isLoading } = useSessions();
  const { payrollMembers } = usePayrollMembers();
  const approver = canMarkPayrollPaid(user);

  const people = useMemo(() => {
    const all = payrollPeople(team, payrollMembers);
    return canSeeAllPayroll(user) ? all : all.filter((person) => person.id === user.userId);
  }, [team, user, payrollMembers]);
  const results = useMemo(() => overtimeByPerson(sessions, people), [sessions, people]);

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <PaySwitcher />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Overtime</h1>
        <p className="text-sm text-muted">
          {approver
            ? "Approve a request and that whole session pays at the overtime rate. You can also make any session overtime from Payroll."
            : "Ask for overtime on a session from Payroll or the session's page. Ray or an admin approves it."}
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : people.length === 0 ? (
        <p className="text-sm text-muted">{user.role === "demo" ? "Overtime isn't part of the demo." : "Nobody is on payroll yet."}</p>
      ) : (
        results.map((result) => (
          <PersonCard key={result.person.id} result={result} rates={ratesFor(result.person.id, payrollMembers)} />
        ))
      )}
    </main>
  );
}

function PersonCard({ result, rates }: { result: PersonOvertime; rates: PayRates | null }) {
  const [showPaid, setShowPaid] = useState(false);
  const owed = totalPay(result.unpaid, rates);

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{result.person.name}</h2>
        <p className="text-sm">
          {result.unpaid.length === 0 ? (
            <span className="text-muted">No unpaid overtime</span>
          ) : (
            <>
              <span className="num font-semibold text-amber-400">{owed ? formatMoney(owed) : formatMinutes(result.unpaidMinutes)}</span>
              <span className="text-muted">
                {" "}
                unpaid overtime · {owed ? `${formatMinutes(result.unpaidMinutes)} · ` : ""}
                {result.unpaid.length} session{result.unpaid.length === 1 ? "" : "s"}
              </span>
            </>
          )}
        </p>
        <p className="text-xs text-muted">
          {rates ? `Overtime pays $${rates.overtime.toString()}/h (base $${rates.base.toString()}/h).` : "No pay rate set — set one on Payroll to see dollars."}
        </p>
      </div>

      {result.requested.length > 0 ? (
        <Group title={`Waiting for approval · ${result.requested.length}`} tone="text-amber-400">
          {result.requested.map((session) => (
            <Row key={session.session_id} session={session} rates={rates} />
          ))}
        </Group>
      ) : null}

      {result.unpaid.length > 0 ? (
        <Group title="Approved, not yet paid">
          {result.unpaid.map((session) => (
            <Row key={session.session_id} session={session} rates={rates} />
          ))}
        </Group>
      ) : null}

      {result.paid.length > 0 ? (
        <div className="border-t border-border pt-2">
          <button onClick={() => setShowPaid((v) => !v)} className="min-h-9 text-sm font-medium text-muted active:text-foreground">
            {showPaid ? "Hide" : "Show"} paid overtime ({result.paid.length})
          </button>
          {showPaid ? result.paid.map((session) => <Row key={session.session_id} session={session} rates={rates} />) : null}
        </div>
      ) : null}
    </section>
  );
}

function Group({ title, tone = "text-muted", children }: { title: string; tone?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className={`text-xs font-medium uppercase tracking-wide ${tone}`}>{title}</h3>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Row({ session, rates }: { session: Session; rates: PayRates | null }) {
  // A pending request shows what it would pay if approved.
  const pay = sessionPay({ ...session, overtime_status: "approved" }, rates);
  return (
    <div className="space-y-1.5 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/sessions/${session.session_id}`} className="min-w-0 text-sm text-foreground">
          <span className="num">{formatDateForDisplay(session.date)}</span>
          <span className="text-muted">
            {" "}
            · {session.time_in}–{session.time_out} · {formatHours(sessionHours(session))}
          </span>
        </Link>
        {pay ? <span className="num shrink-0 text-sm font-semibold text-foreground">{formatMoney(pay)}</span> : null}
      </div>
      <OvertimeControl session={session} compact />
    </div>
  );
}
