"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLoans } from "@/hooks/useLoans";
import { LoanForm } from "@/components/loans/LoanForm";
import { Button } from "@/components/ui/Button";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { canEditLoanEntry } from "@/lib/auth/permissions";
import { formatDateForDisplay, formatDateTimeForDisplay } from "@/lib/dates";
import { formatMoney } from "@/lib/decimal";

export default function LoanEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = useCurrentUser();
  const router = useRouter();
  const { id } = use(params);
  const { loans, isLoading, remove } = useLoans();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const entry = loans.find((row) => row.loan_entry_id === id);

  if (isLoading) return <p className="px-4 pt-4 text-sm text-muted">Loading…</p>;
  if (!entry) return <p className="px-4 pt-4 text-sm text-muted">Loan not found (try syncing).</p>;
  const canEdit = canEditLoanEntry(user, entry);

  async function handleDelete() {
    if (!entry) return;
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy(true);
    try {
      await remove(entry.loan_entry_id);
      router.replace("/loans");
    } catch {
      setError("Could not delete. Check sync status and try again.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">{entry.kind === "loan" ? "Loan" : "Repayment"}</h1>
        <Link href="/loans" className="px-2 py-2 text-sm text-muted">
          Back
        </Link>
      </div>
      <p className="text-xs text-muted">
        Recorded by {entry.recorded_by || "—"}
        {entry.recorded_at ? ` · ${formatDateTimeForDisplay(entry.recorded_at)}` : ""}
      </p>

      {canEdit ? (
        <>
          <LoanForm key={`${entry.loan_entry_id}-${entry._row_version}`} entry={entry} />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button variant={confirmDelete ? "danger" : "ghost"} onClick={handleDelete} disabled={busy} className="w-full text-red-400">
            {confirmDelete ? "Tap again to delete" : "Delete"}
          </Button>
        </>
      ) : (
        <section className="space-y-2 rounded-2xl border border-border bg-surface p-4 text-sm">
          <p className="text-foreground">
            <span className="font-medium">{entry.from_name}</span>
            <span className="text-muted">{entry.kind === "loan" ? " lent " : " paid back "}</span>
            <span className="font-medium">{entry.to_name}</span>
          </p>
          <p className="num text-2xl font-semibold text-foreground">{formatMoney(entry.amount)}</p>
          <p className="text-muted">{formatDateForDisplay(entry.date)}</p>
          {entry.note ? <p className="text-foreground">{entry.note}</p> : null}
          <p className="text-xs text-muted">Only whoever recorded this, the two people in it, or an admin can change it.</p>
        </section>
      )}
    </main>
  );
}
