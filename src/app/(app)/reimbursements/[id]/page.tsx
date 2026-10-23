"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReimbursements } from "@/hooks/useReimbursements";
import { useSessions } from "@/hooks/useSessions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { canEditReimbursement, canSettleReimbursements } from "@/lib/auth/permissions";
import { formatDateForDisplay, formatDateTimeForDisplay } from "@/lib/dates";
import { formatMoney } from "@/lib/decimal";
import { sessionPlayerName } from "@/lib/sessionHelpers";

const LINK_BUTTON =
  "flex h-10 min-w-12 items-center rounded-xl border border-border bg-surface-raised px-4 text-sm font-medium text-foreground active:bg-neutral-800";

export default function ReimbursementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = useCurrentUser();
  const router = useRouter();
  const { id } = use(params);
  const { reimbursements, isLoading, update, remove } = useReimbursements();
  const { sessions } = useSessions();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  const item = reimbursements.find((row) => row.reimbursement_id === id);
  if (isLoading) return <p className="px-4 pt-4 text-sm text-muted">Loading…</p>;
  if (!item) return <p className="px-4 pt-4 text-sm text-muted">Reimbursement not found (try syncing).</p>;

  const paid = item.status === "paid";
  const canEdit = canEditReimbursement(user, item);
  const canSettle = canSettleReimbursements(user);
  const session = item.session_id ? sessions.find((s) => s.session_id === item.session_id) : undefined;

  async function setStatus(status: "owed" | "paid") {
    if (!item) return;
    setBusy(true);
    setError("");
    try {
      await update(
        item.reimbursement_id,
        status === "paid"
          ? { status, paid_by: user.name, paid_at: new Date().toISOString() }
          : { status, paid_by: "", paid_at: "" },
        item._row_version,
      );
    } catch {
      setError("Could not save. Check sync status and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await remove(item.reimbursement_id);
      router.replace("/reimbursements");
    } catch {
      setError("Could not delete. Check sync status and try again.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 pt-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-foreground">{item.payee || "Unknown"}</h1>
            {paid ? <Badge tone="accent">Paid</Badge> : <Badge tone="warning">Owed</Badge>}
          </div>
          <p className="text-sm text-muted">{formatDateForDisplay(item.date)}</p>
        </div>
        {canEdit ? (
          <Link href={`/reimbursements/${item.reimbursement_id}/edit`} className={LINK_BUTTON}>
            Edit
          </Link>
        ) : null}
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 text-sm">
        <p className={`num text-3xl font-semibold ${paid ? "text-foreground" : "text-amber-400"}`}>{formatMoney(item.amount)}</p>
        <p className="whitespace-pre-wrap text-foreground">{item.reason || <span className="text-muted">No description</span>}</p>
        {item.session_id ? (
          <p>
            <span className="text-muted">Session: </span>
            <Link href={`/sessions/${item.session_id}`} className="text-emerald-400 underline-offset-2 active:underline">
              {session ? `${sessionPlayerName(session)} · ${formatDateForDisplay(session.date)}` : "View session"}
            </Link>
          </p>
        ) : null}
        <div className="space-y-0.5 border-t border-border pt-2 text-xs text-muted">
          <p>
            Filed by {item.requested_by || "—"}
            {item.requested_at ? ` · ${formatDateTimeForDisplay(item.requested_at)}` : ""}
          </p>
          {paid ? (
            <p>
              Paid{item.paid_by ? ` by ${item.paid_by}` : ""}
              {item.paid_at ? ` · ${formatDateTimeForDisplay(item.paid_at)}` : ""}
            </p>
          ) : null}
        </div>
      </section>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {canSettle ? (
        paid ? (
          <Button variant="secondary" onClick={() => setStatus("owed")} disabled={busy} className="h-12 w-full">
            Mark unpaid
          </Button>
        ) : (
          <Button onClick={() => setStatus("paid")} disabled={busy} className="h-14 w-full text-base">
            {busy ? "Saving…" : "Mark paid"}
          </Button>
        )
      ) : !paid ? (
        <p className="text-sm text-muted">A partner or admin marks this paid once the money is sent.</p>
      ) : null}

      {canEdit ? (
        <Button variant={confirmDelete ? "danger" : "ghost"} onClick={handleDelete} disabled={busy} className="w-full text-red-400">
          {confirmDelete ? "Tap again to delete" : "Delete"}
        </Button>
      ) : null}
    </main>
  );
}
