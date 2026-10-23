"use client";

import { use } from "react";
import Link from "next/link";
import { ReimbursementForm } from "@/components/reimbursements/ReimbursementForm";
import { useReimbursements } from "@/hooks/useReimbursements";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { canEditReimbursement } from "@/lib/auth/permissions";

export default function EditReimbursementPage({ params }: { params: Promise<{ id: string }> }) {
  const user = useCurrentUser();
  const { id } = use(params);
  const { reimbursements, isLoading } = useReimbursements();
  const item = reimbursements.find((row) => row.reimbursement_id === id);

  if (isLoading) return <p className="px-4 pt-4 text-sm text-muted">Loading…</p>;
  if (!item) return <p className="px-4 pt-4 text-sm text-muted">Reimbursement not found (try syncing).</p>;
  if (!canEditReimbursement(user, item)) {
    return <p className="px-4 pt-4 text-sm text-muted">You can&apos;t edit this reimbursement.</p>;
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Edit reimbursement</h1>
        <Link href={`/reimbursements/${id}`} className="px-2 py-2 text-sm text-muted">
          Cancel
        </Link>
      </div>
      <ReimbursementForm key={`${item.reimbursement_id}-${item._row_version}`} item={item} />
    </main>
  );
}
