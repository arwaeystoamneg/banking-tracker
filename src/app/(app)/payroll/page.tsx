"use client";

import { useMemo, useState } from "react";
import { useSessions } from "@/hooks/useSessions";
import { usePayrollMembers } from "@/hooks/usePayrollMembers";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatMoney } from "@/lib/decimal";
import { ratesFor, sessionPay, totalPay, type PayRates } from "@/lib/overtime";
import type { PayrollMember } from "@/lib/validation/schemas";
import { PaySwitcher } from "@/components/payroll/PaySwitcher";
import { PayrollSessionRow } from "@/components/payroll/PayrollSessionRow";
import { useCurrentUser, useTeam } from "@/components/providers/AuthProvider";
import { formatDateForDisplay } from "@/lib/dates";
import {
  PAYROLL_START_DATE,
  canMarkPayrollPaid,
  canSeeAllPayroll,
  payrollPeople,
  formatHours,
  payrollByEmployee,
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

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <PaySwitcher />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Payroll</h1>
        <p className="text-sm text-muted">
          Sessions since {formatDateForDisplay(PAYROLL_START_DATE)}. {canMark ? "Check each one off once paid." : "Ray or an admin checks sessions off once paid."}
        </p>
      </div>

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

  const parse = (value: string) => (value.trim() === "" ? null : Number(value));
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
}: {
  summary: EmployeePayroll;
  canMark: boolean;
  rates: PayRates | null;
  member?: PayrollMember;
}) {
  const { update } = useSessions();
  const [editingRates, setEditingRates] = useState(false);
  const unpaidPay = totalPay(summary.unpaid, rates);
  const unpaidOvertime = summary.unpaid.filter((s) => s.overtime_status === "approved").length;
  const requests = summary.unpaid.filter((s) => s.overtime_status === "requested").length;
  const [showPaid, setShowPaid] = useState(false);
  const [payingAll, setPayingAll] = useState(false);
  const owed = summary.unpaid.length;

  async function markAllPaid() {
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
            {payingAll ? "Saving…" : "Mark all paid"}
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
          <button onClick={() => setShowPaid((v) => !v)} className="min-h-9 text-sm font-medium text-muted active:text-foreground">
            {showPaid ? "Hide" : "Show"} paid ({summary.paid.length})
          </button>
          {showPaid ? (
            <div>
              {summary.paid.map((session) => (
                <PayrollSessionRow key={session.session_id} session={session} canMark={canMark} pay={sessionPay(session, rates)} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
