"use client";

import { useMemo, useState } from "react";
import { useSessions } from "@/hooks/useSessions";
import { usePayrollMembers } from "@/hooks/usePayrollMembers";
import { Badge } from "@/components/ui/Badge";
import { PaySwitcher } from "@/components/payroll/PaySwitcher";
import { useCurrentUser, useTeam } from "@/components/providers/AuthProvider";
import { canSeeAllPayroll, payrollPeople, PAYROLL_START_DATE } from "@/lib/payroll";
import { formatDateForDisplay } from "@/lib/dates";
import { formatMoney } from "@/lib/decimal";
import {
  formatMinutes,
  overtimeByPerson,
  payFor,
  ratesFor,
  type PayRates,
  type PersonOvertime,
  type WeekOvertime,
} from "@/lib/overtime";
import { format, parseISO } from "date-fns";

const shortDate = (date: string) => format(parseISO(date), "MMM d");

export default function OvertimePage() {
  const user = useCurrentUser();
  const team = useTeam();
  const { sessions, isLoading } = useSessions();
  const { payrollMembers } = usePayrollMembers();

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
          California rules: over 8h a day or 40h a week at overtime, over 12h a day at double time, and the 7th day
          worked in a week at overtime (double past 8h). Weeks run Sunday–Saturday, since{" "}
          {formatDateForDisplay(PAYROLL_START_DATE)}. An estimate — check it against your payroll provider.
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

function weekPay(week: WeekOvertime, rates: PayRates | null) {
  return rates ? payFor({ regular: week.regular, overtime: week.overtime, doubleTime: week.doubleTime }, rates) : null;
}

function PersonCard({ result, rates }: { result: PersonOvertime; rates: PayRates | null }) {
  const extra = result.unpaidOvertime + result.unpaidDoubleTime;
  const extraPay = rates
    ? payFor({ regular: 0, overtime: result.unpaidOvertime, doubleTime: result.unpaidDoubleTime }, rates)
    : null;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{result.person.name}</h2>
        <p className="text-sm">
          {extra === 0 ? (
            <span className="text-muted">No unpaid overtime</span>
          ) : (
            <>
              <span className="num font-semibold text-amber-400">{extraPay ? formatMoney(extraPay) : formatMinutes(extra)}</span>
              <span className="text-muted">
                {" "}
                in unpaid overtime · {formatMinutes(result.unpaidOvertime)} OT
                {result.unpaidDoubleTime > 0 ? ` · ${formatMinutes(result.unpaidDoubleTime)} double` : ""}
              </span>
            </>
          )}
        </p>
        {!rates ? <p className="text-xs text-muted">No pay rate set — set one on Payroll to see dollars.</p> : null}
      </div>

      {result.weeks.length === 0 ? (
        <p className="text-sm text-muted">No sessions since payroll tracking started.</p>
      ) : (
        <div className="divide-y divide-border">
          {result.weeks.map((week) => (
            <WeekRow key={week.weekStart} week={week} rates={rates} />
          ))}
        </div>
      )}
    </section>
  );
}

function WeekRow({ week, rates }: { week: WeekOvertime; rates: PayRates | null }) {
  const [open, setOpen] = useState(false);
  const pay = weekPay(week, rates);
  const hasExtra = week.overtime + week.doubleTime > 0;
  return (
    <div className="py-2.5">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="text-sm text-foreground">
            {shortDate(week.weekStart)}–{shortDate(week.weekEnd)}{" "}
            {week.paid ? <Badge tone="accent">Paid</Badge> : <Badge tone="warning">Unpaid</Badge>}
          </p>
          <p className="num text-xs text-muted">
            {formatMinutes(week.worked)} worked · {formatMinutes(week.regular)} regular
            {week.overtime > 0 ? ` · ${formatMinutes(week.overtime)} OT` : ""}
            {week.doubleTime > 0 ? ` · ${formatMinutes(week.doubleTime)} 2×` : ""}
            {week.inProgress > 0 ? ` · ${week.inProgress} still open` : ""}
            {week.missingTimes > 0 ? ` · ${week.missingTimes} missing times` : ""}
          </p>
        </div>
        <span className={`num shrink-0 text-sm font-semibold ${hasExtra ? "text-amber-400" : "text-muted-strong"}`}>
          {pay ? formatMoney(pay) : hasExtra ? formatMinutes(week.overtime + week.doubleTime) : ""}
        </span>
      </button>
      {open ? (
        <div className="mt-2 space-y-1 rounded-xl bg-surface-raised p-2.5">
          {week.days.map((day) => (
            <div key={day.date} className="num flex justify-between gap-3 text-xs">
              <span className="text-foreground">
                {format(parseISO(day.date), "EEE MMM d")}
                {day.seventhDay ? " · 7th day" : ""}
              </span>
              <span className="text-muted">
                {formatMinutes(day.worked)}
                {day.overtime > 0 ? ` · ${formatMinutes(day.overtime)} OT` : ""}
                {day.doubleTime > 0 ? ` · ${formatMinutes(day.doubleTime)} 2×` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
