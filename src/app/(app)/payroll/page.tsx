"use client";

import { useMemo, useState } from "react";
import { useSessions } from "@/hooks/useSessions";
import { usePayrollMembers } from "@/hooks/usePayrollMembers";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { d, formatMoney, parseMoneyInput, type Decimal } from "@/lib/decimal";
import { useReimbursements } from "@/hooks/useReimbursements";
import { paySlips, sortedTotals, splitAmount, UNASSIGNED } from "@/lib/backing";
import { BackerSlips, type BackerRow } from "@/components/payroll/BackerSlips";
import { ratesFor, sessionPay, totalPay, type PayRates } from "@/lib/overtime";
import type { PayrollMember } from "@/lib/validation/schemas";
import { PaySwitcher } from "@/components/payroll/PaySwitcher";
import { PayrollSessionRow } from "@/components/payroll/PayrollSessionRow";
import { useCurrentUser, useTeam } from "@/components/providers/AuthProvider";
import { formatDateForDisplay } from "@/lib/dates";
import { DateWindowBar, distinctDates, useDateWindow } from "@/components/ui/DateWindowBar";
import {
  PAYROLL_START_DATE,
  canMarkPayrollPaid,
  canSeeAllPayroll,
  payrollPeople,
  formatHours,
  payrollByEmployee,
  sessionHours,
  type EmployeePayroll,
} from "@/lib/payroll";

export default function PayrollPage() {
  const user = useCurrentUser();
  const team = useTeam();
  const { sessions, isLoading } = useSessions();
  const { payrollMembers } = usePayrollMembers();
  const canMark = canMarkPayrollPaid(user);

  const employees = useMemo(() => {
    const all = payrollPeople(team, payrollMembers);
    return canSeeAllPayroll(user) ? all : all.filter((employee) => employee.id === user.userId);
  }, [team, user, payrollMembers]);
  const summaries = useMemo(() => payrollByEmployee(sessions, employees), [sessions, employees]);
  const paidDates = useMemo(() => distinctDates(summaries.flatMap((summary) => summary.paid.map((session) => session.date))), [summaries]);
  const paidWindow = useDateWindow(paidDates);
  const totals = useMemo(() => {
    let money = d(0);
    let hours = d(0);
    let count = 0;
    let unrated = 0;
    for (const summary of summaries) {
      const rates = ratesFor(summary.employee.id, payrollMembers);
      for (const session of summary.paid) {
        if (!paidWindow.contains(session.date)) continue;
        count += 1;
        hours = hours.plus(sessionHours(session) ?? 0);
        const pay = sessionPay(session, rates);
        if (pay) money = money.plus(pay);
        else unrated += 1;
      }
    }
    return { money, hours, count, unrated };
  }, [summaries, payrollMembers, paidWindow]);

  // What each backer owes: their unpaid slips (their share of each session's pay they haven't paid yet) and their
  // share of owed reimbursements, plus the slips they've paid for sessions in the date window.
  const { reimbursements } = useReimbursements();
  const byBacker = useMemo(() => {
    const zero = d(0);
    const rows = new Map<string, BackerRow>();
    const rowOf = (name: string) => {
      if (!rows.has(name)) rows.set(name, { name, wages: zero, owedBack: zero, paid: zero, slips: [] });
      return rows.get(name)!;
    };
    for (const summary of summaries) {
      const rates = ratesFor(summary.employee.id, payrollMembers);
      for (const session of [...summary.unpaid, ...summary.paid]) {
        const pay = sessionPay(session, rates);
        if (!pay) continue;
        for (const slip of paySlips(session, pay)) {
          const row = rowOf(slip.name);
          if (slip.paidAt) {
            if (paidWindow.contains(session.date)) row.paid = row.paid.plus(slip.amount);
          } else {
            row.wages = row.wages.plus(slip.amount);
            row.slips.push({ session, employee: summary.employee.name, amount: slip.amount });
          }
        }
      }
    }
    for (const item of reimbursements) {
      if (item.status !== "owed") continue;
      for (const [name, piece] of splitAmount(item.amount, item.backing)) rowOf(name).owedBack = rowOf(name).owedBack.plus(piece);
    }
    const order = sortedTotals(new Map([...rows.values()].map((row) => [row.name, row.wages.plus(row.owedBack).plus(row.paid)])));
    return order.map(({ name }) => rows.get(name)!);
  }, [summaries, payrollMembers, paidWindow, reimbursements]);

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <PaySwitcher />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Payroll</h1>
        <p className="text-sm text-muted">
          Sessions since {formatDateForDisplay(PAYROLL_START_DATE)}. {canMark ? "Check each one off once paid." : "Ray or an admin checks sessions off once paid."}
        </p>
      </div>

      {!isLoading && canSeeAllPayroll(user) && byBacker.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-border bg-surface p-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">By backer</h2>
            <p className="text-xs text-muted">
              Each session&apos;s pay and each reimbursement split by who backs it. Set splits on a session, a reimbursement, or a whole trip.
            </p>
          </div>
          <div className="divide-y divide-border">
            {byBacker.map((row) => (
              <BackerSlips key={row.name} row={row} canMark={canMark} paidLabel={paidWindow.isAll ? "paid" : "paid in window"} />
            ))}
          </div>
          {byBacker.some((row) => row.name === UNASSIGNED) ? (
            <p className="text-xs text-amber-400">Unassigned = sessions or reimbursements with no backer split yet.</p>
          ) : null}
        </section>
      ) : null}

      {!isLoading && paidDates.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted">Total paid{paidWindow.isAll ? "" : " in window"}</p>
              <p className="num text-2xl font-semibold text-emerald-400">{formatMoney(totals.money)}</p>
            </div>
            <p className="num text-right text-xs text-muted">
              {formatHours(totals.hours)} · {totals.count} session{totals.count === 1 ? "" : "s"}
              {totals.unrated > 0 ? <span className="block text-amber-400">{totals.unrated} with no rate or times, not in $</span> : null}
            </p>
          </div>
          <DateWindowBar days={paidWindow.days} playDates={paidDates} window={paidWindow.window} onChange={paidWindow.setWindow} label="Paid sessions" />
        </section>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : employees.length === 0 ? (
        <p className="text-sm text-muted">
          {user.role === "demo"
            ? "Payroll isn't part of the demo."
            : canMark
              ? "Nobody is on payroll yet. Add someone below."
              : "Nobody is on payroll yet."}
        </p>
      ) : (
        summaries.map((summary) => (
          <EmployeeCard
            key={summary.employee.id}
            summary={summary}
            canMark={canMark}
            rates={ratesFor(summary.employee.id, payrollMembers)}
            member={payrollMembers.find((row) => row.member_id === summary.employee.id)}
            inPaidWindow={paidWindow.contains}
          />
        ))
      )}

      {canMark && !isLoading ? <PayrollRoster /> : null}
    </main>
  );
}

/** Ray and admin choose who's on payroll. Employee accounts are always on and can't be removed here. */
function PayrollRoster() {
  const user = useCurrentUser();
  const team = useTeam();
  const { payrollMembers, create, remove } = usePayrollMembers();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function toggle(personId: string) {
    setBusy(personId);
    setError("");
    try {
      const rows = payrollMembers.filter((row) => row.member_id === personId);
      if (rows.length > 0) {
        for (const row of rows) await remove(row.membership_id);
      } else {
        const person = team.find((member) => member.id === personId);
        await create({ member_id: personId, member_name: person?.name ?? "", added_by: user.name, added_at: new Date().toISOString() });
      }
    } catch {
      setError("Could not save. Check sync status and try again.");
    } finally {
      setBusy("");
    }
  }

  if (team.length === 0) return null;
  const added = new Set(payrollMembers.map((row) => row.member_id));

  return (
    <section className="space-y-2 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Who&apos;s on payroll</h2>
      <div className="flex flex-wrap gap-2">
        {team.map((person) =>
          person.role === "employee" ? (
            <Chip key={person.id} active onClick={() => undefined}>
              {person.name} · employee
            </Chip>
          ) : (
            <Chip key={person.id} active={added.has(person.id)} onClick={() => busy || void toggle(person.id)}>
              {busy === person.id ? "…" : person.name}
            </Chip>
          ),
        )}
      </div>
      <p className="text-xs text-muted">Tap a name to add or remove them. Employee accounts are always on payroll.</p>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </section>
  );
}

/** Ray and admin set a person's base and overtime rates. A blank overtime rate means 1.5× base. */
function RatesEditor({ personId, personName, member, onDone }: { personId: string; personName: string; member?: PayrollMember; onDone: () => void }) {
  const user = useCurrentUser();
  const { create, update } = usePayrollMembers();
  const [base, setBase] = useState(member?.hourly_rate == null ? "" : String(member.hourly_rate));
  const [overtime, setOvertime] = useState(member?.overtime_rate == null ? "" : String(member.overtime_rate));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const parse = (value: string) => (value.trim() === "" ? null : parseMoneyInput(value));
  async function save() {
    const rates = { hourly_rate: parse(base), overtime_rate: parse(overtime) };
    if (Object.values(rates).some((rate) => rate !== null && (!Number.isFinite(rate) || rate < 0))) return setError("Rates must be dollar amounts.");
    setSaving(true);
    setError("");
    try {
      if (member) await update(member.membership_id, rates, member._row_version);
      else await create({ member_id: personId, member_name: personName, added_by: user.name, added_at: new Date().toISOString(), ...rates });
      onDone();
    } catch {
      setError("Could not save. Check sync status and try again.");
      setSaving(false);
    }
  }

  const baseNumber = parse(base);
  const field = (label: string, value: string, set: (v: string) => void, placeholder: string) => (
    <label className="block space-y-1">
      <span className="text-xs text-muted">{label}</span>
      <Input value={value} onChange={(e) => set(e.target.value)} inputMode="decimal" placeholder={placeholder} className="h-11" />
    </label>
  );
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-raised p-3">
      <div className="grid grid-cols-2 gap-2">
        {field("Base $/h", base, setBase, "0")}
        {field("Overtime $/h", overtime, setOvertime, baseNumber ? String(baseNumber * 1.5) : "1.5×")}
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving} className="h-10 flex-1 text-xs">
          {saving ? "Saving…" : "Save rates"}
        </Button>
        <Button variant="ghost" onClick={onDone} className="h-10 text-xs text-muted">
          Cancel
        </Button>
      </div>
    </div>
  );
}

function EmployeeCard({
  summary,
  canMark,
  rates,
  member,
  inPaidWindow,
}: {
  summary: EmployeePayroll;
  canMark: boolean;
  rates: PayRates | null;
  member?: PayrollMember;
  /** The page's date window; only paid figures follow it, since unpaid pay is owed whatever the dates. */
  inPaidWindow: (date: string) => boolean;
}) {
  const { update } = useSessions();
  const [editingRates, setEditingRates] = useState(false);
  const unpaidPay = totalPay(summary.unpaid, rates);
  // Who pays this person's unpaid wages, by each session's backers.
  const unpaidByBacker = (() => {
    const totals = new Map<string, Decimal>();
    for (const session of summary.unpaid) {
      const pay = sessionPay(session, rates);
      if (!pay) continue;
      for (const slip of paySlips(session, pay)) {
        if (!slip.paidAt) totals.set(slip.name, (totals.get(slip.name) ?? d(0)).plus(slip.amount));
      }
    }
    return sortedTotals(totals);
  })();
  const unpaidOvertime = summary.unpaid.filter((s) => s.overtime_status === "approved").length;
  const requests = summary.unpaid.filter((s) => s.overtime_status === "requested").length;
  const [showPaid, setShowPaid] = useState(false);
  const [payingAll, setPayingAll] = useState(false);
  const owed = summary.unpaid.length;
  const paid = summary.paid.filter((session) => inPaidWindow(session.date));
  const paidPay = totalPay(paid, rates);
  const paidHours = paid.reduce((sum, session) => sum.plus(sessionHours(session) ?? 0), d(0));

  const [confirmAll, setConfirmAll] = useState(false);
  async function markAllPaid() {
    // A stray tap shouldn't pay everyone: the first tap asks, the second pays.
    if (!confirmAll) {
      setConfirmAll(true);
      setTimeout(() => setConfirmAll(false), 5000);
      return;
    }
    setConfirmAll(false);
    setPayingAll(true);
    try {
      for (const session of summary.unpaid) {
        await update(session.session_id, { payroll_paid_at: new Date().toISOString(), payroll_paid_by: "…" }, session._row_version);
      }
    } finally {
      setPayingAll(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground">{summary.employee.name}</h2>
          <p className="text-sm">
            {owed === 0 ? (
              <span className="text-emerald-400">All paid up</span>
            ) : (
              <>
                <span className="num font-semibold text-amber-400">
                  {unpaidPay ? formatMoney(unpaidPay) : formatHours(summary.unpaidHours)}
                </span>
                <span className="text-muted">
                  {" "}
                  unpaid · {unpaidPay ? `${formatHours(summary.unpaidHours)} · ` : ""}
                  {owed} session{owed === 1 ? "" : "s"}
                  {unpaidOvertime > 0 ? ` · ${unpaidOvertime} overtime` : ""}
                  {requests > 0 ? ` · ${requests} OT request${requests === 1 ? "" : "s"}` : ""}
                </span>
              </>
            )}
          </p>
          {unpaidByBacker.length > 0 ? (
            <p className="num text-xs text-muted">
              Who pays:{" "}
              {unpaidByBacker.map((row, i) => (
                <span key={row.name} className={row.name === UNASSIGNED ? "text-amber-400" : undefined}>
                  {i > 0 ? " · " : ""}
                  {row.name} {formatMoney(row.amount)}
                </span>
              ))}
            </p>
          ) : null}
          <p className="text-xs text-muted">
            {rates
              ? `$${rates.base.toString()}/h · overtime $${rates.overtime.toString()}/h`
              : "No pay rate set — showing hours only."}
            {canMark && !editingRates ? (
              <button onClick={() => setEditingRates(true)} className="ml-2 font-medium text-emerald-400">
                {rates ? "Edit" : "Set rate"}
              </button>
            ) : null}
          </p>
          {summary.missingTimes > 0 ? (
            <p className="text-xs text-amber-400">
              {summary.missingTimes} session{summary.missingTimes === 1 ? " is" : "s are"} missing times, so the hours are short.
            </p>
          ) : null}
        </div>
        {canMark && owed > 1 ? (
          <Button onClick={markAllPaid} disabled={payingAll} className="h-10 shrink-0 px-3 text-xs">
            {payingAll ? "Saving…" : confirmAll ? `Pay ${owed}${unpaidPay ? ` · ${formatMoney(unpaidPay)}` : ""}?` : "Mark all paid"}
          </Button>
        ) : null}
      </div>

      {editingRates ? (
        <RatesEditor
          personId={summary.employee.id}
          personName={summary.employee.name}
          member={member}
          onDone={() => setEditingRates(false)}
        />
      ) : null}

      {summary.unpaid.length + summary.inProgress.length > 0 ? (
        <div>
          {summary.inProgress.map((session) => (
            <PayrollSessionRow key={session.session_id} session={session} canMark={canMark} pay={sessionPay(session, rates)} />
          ))}
          {summary.unpaid.map((session) => (
            <PayrollSessionRow key={session.session_id} session={session} canMark={canMark} pay={sessionPay(session, rates)} />
          ))}
        </div>
      ) : null}

      {summary.paid.length > 0 ? (
        <div className="border-t border-border pt-2">
          <div className="flex items-center justify-between gap-3">
            <button onClick={() => setShowPaid((v) => !v)} className="min-h-9 text-sm font-medium text-muted active:text-foreground">
              {showPaid ? "Hide" : "Show"} paid ({paid.length})
            </button>
            <p className="num text-right text-sm">
              <span className="font-semibold text-emerald-400">{paidPay ? formatMoney(paidPay) : formatHours(paidHours)}</span>
              <span className="text-muted"> paid{paidPay ? ` · ${formatHours(paidHours)}` : ""}</span>
            </p>
          </div>
          {showPaid ? (
            <div>
              {paid.map((session) => (
                <PayrollSessionRow key={session.session_id} session={session} canMark={canMark} pay={sessionPay(session, rates)} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
