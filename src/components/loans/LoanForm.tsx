"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLoans } from "@/hooks/useLoans";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PersonPicker, pickedFrom, type PickedPerson } from "@/components/ui/PersonPicker";
import { todayDateString } from "@/lib/dates";
import { getRememberedLoggedBy, rememberLoggedBy } from "@/lib/loggedInAs";
import type { LoanEntry, LoanKind } from "@/lib/validation/schemas";
import { useCurrentUser, useTeam } from "@/components/providers/AuthProvider";
import { isConfiguredAccountRole } from "@/lib/auth/types";

const LABEL = "text-xs font-medium uppercase tracking-wide text-muted";
const EMPTY: PickedPerson = { id: "", name: "", other: false };

export interface LoanPrefill {
  kind?: LoanKind;
  from?: { id: string; name: string };
  to?: { id: string; name: string };
  amount?: string;
}

/** Record a loan (lender → borrower) or a repayment (borrower → lender). */
export function LoanForm({ entry, prefill }: { entry?: LoanEntry; prefill?: LoanPrefill }) {
  const user = useCurrentUser();
  const team = useTeam();
  const router = useRouter();
  const { create, update } = useLoans();
  const isAccount = isConfiguredAccountRole(user.role);

  const [kind, setKind] = useState<LoanKind>(entry?.kind ?? prefill?.kind ?? "loan");
  const [from, setFrom] = useState<PickedPerson>(() => {
    if (entry) return pickedFrom({ id: entry.from_id, name: entry.from_name }, team);
    if (prefill?.from) return pickedFrom(prefill.from, team);
    return isAccount ? pickedFrom({ id: user.userId, name: user.name }, team) : EMPTY;
  });
  const [to, setTo] = useState<PickedPerson>(() => {
    if (entry) return pickedFrom({ id: entry.to_id, name: entry.to_name }, team);
    return prefill?.to ? pickedFrom(prefill.to, team) : EMPTY;
  });
  const [amount, setAmount] = useState(() => (entry ? String(entry.amount) : prefill?.amount ?? ""));
  const [date, setDate] = useState(() => entry?.date ?? todayDateString());
  const [note, setNote] = useState(() => entry?.note ?? "");
  const [recordedBy, setRecordedBy] = useState(() => entry?.recorded_by ?? (isAccount ? user.name : getRememberedLoggedBy()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isLoan = kind === "loan";
  const sameIds = from.id && to.id && from.id === to.id;
  const sameNames = !from.id && !to.id && from.name.trim() && from.name.trim().toLowerCase() === to.name.trim().toLowerCase();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    const problems: string[] = [];
    if (!from.name.trim()) problems.push(isLoan ? "who lent" : "who paid");
    if (!to.name.trim()) problems.push(isLoan ? "who borrowed" : "who was paid");
    if (amount === "" || !Number.isFinite(value) || value <= 0) problems.push("amount");
    if (!date) problems.push("date");
    if (!isAccount && !recordedBy.trim()) problems.push("your name");
    if (problems.length > 0) return setError(`Still needed: ${problems.join(", ")}.`);
    if (sameIds || sameNames) return setError("Pick two different people.");

    setSubmitting(true);
    setError("");
    if (!isAccount) rememberLoggedBy(recordedBy.trim());
    const fields = {
      kind,
      amount: value,
      date,
      note: note.trim(),
      from_name: from.name.trim(),
      from_id: from.id,
      to_name: to.name.trim(),
      to_id: to.id,
      ...(isAccount ? {} : { recorded_by: recordedBy.trim() }),
    };
    try {
      if (entry) {
        await update(entry.loan_entry_id, fields, entry._row_version);
      } else {
        await create({
          ...fields,
          recorded_by: isAccount ? user.name : recordedBy.trim(),
          recorded_at: new Date().toISOString(),
          owner_id: user.userId,
        });
      }
      router.push("/loans");
    } catch {
      setError("Could not save. Nothing was lost; check sync status and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 rounded-xl border border-border bg-surface p-0.5 text-sm">
        {(["loan", "repayment"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            aria-pressed={kind === value}
            className={`min-h-10 rounded-lg font-medium transition-colors ${
              kind === value ? "bg-surface-raised text-foreground" : "text-muted active:text-foreground"
            }`}
          >
            {value === "loan" ? "Loan" : "Repayment"}
          </button>
        ))}
      </div>

      <PersonPicker label={isLoan ? "Who lent the money?" : "Who paid it back?"} people={team} meId={user.userId} value={from} onChange={setFrom} />
      <PersonPicker label={isLoan ? "Who borrowed it?" : "Paid back to"} people={team} meId={user.userId} value={to} onChange={setTo} />

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className={LABEL}>Amount</span>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" />
        </label>
        <label className="block space-y-1">
          <span className={LABEL}>Date</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <label className="block space-y-1">
        <span className={LABEL}>Note (optional)</span>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What it was for, terms…" />
      </label>

      {isAccount ? null : (
        <label className="block space-y-1">
          <span className={LABEL}>Your name (recorded by)</span>
          <Input value={recordedBy} onChange={(e) => setRecordedBy(e.target.value)} placeholder="Name" />
        </label>
      )}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <Button type="submit" disabled={submitting} className="h-14 w-full text-base">
        {submitting ? "Saving…" : entry ? "Save changes" : isLoan ? "Record loan" : "Record repayment"}
      </Button>
    </form>
  );
}
