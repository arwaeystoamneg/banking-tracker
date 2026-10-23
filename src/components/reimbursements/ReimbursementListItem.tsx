"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { useReimbursements } from "@/hooks/useReimbursements";
import { canSettleReimbursements } from "@/lib/auth/permissions";
import { formatDateForDisplay, formatDateTimeForDisplay } from "@/lib/dates";
import { formatMoney } from "@/lib/decimal";
import type { Reimbursement } from "@/lib/validation/schemas";

export function ReimbursementListItem({ item }: { item: Reimbursement }) {
  const user = useCurrentUser();
  const { update } = useReimbursements();
  const [saving, setSaving] = useState(false);
  const paid = item.status === "paid";
  const filedForSomeoneElse = item.requested_by.trim().toLowerCase() !== item.payee.trim().toLowerCase();

  async function markPaid() {
    setSaving(true);
    try {
      await update(item.reimbursement_id, { status: "paid", paid_by: user.name, paid_at: new Date().toISOString() }, item._row_version);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-stretch gap-2 rounded-2xl border border-border bg-surface">
      <Link
        href={`/reimbursements/${item.reimbursement_id}`}
        className="min-w-0 flex-1 rounded-2xl p-4 transition-colors active:bg-surface-raised"
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-base font-medium text-foreground">{item.payee || "Unknown"}</p>
          <p className={`num text-base font-semibold ${paid ? "text-muted" : "text-amber-400"}`}>{formatMoney(item.amount)}</p>
        </div>
        <p className="truncate text-sm text-muted">
          {item.reason || "No description"} · <span className="num">{formatDateForDisplay(item.date)}</span>
        </p>
        <p className="text-xs text-muted">
          {paid
            ? `Paid${item.paid_by ? ` by ${item.paid_by}` : ""}${item.paid_at ? ` · ${formatDateTimeForDisplay(item.paid_at)}` : ""}`
            : filedForSomeoneElse
              ? `Filed by ${item.requested_by}`
              : null}
        </p>
      </Link>
      <div className="flex shrink-0 items-center pr-3">
        {!paid && canSettleReimbursements(user) ? (
          <Button variant="secondary" onClick={markPaid} disabled={saving} className="h-10 px-3 text-xs">
            {saving ? "…" : "Mark paid"}
          </Button>
        ) : (
          <Badge tone={paid ? "accent" : "warning"}>{paid ? "Paid" : "Owed"}</Badge>
        )}
      </div>
    </div>
  );
}
