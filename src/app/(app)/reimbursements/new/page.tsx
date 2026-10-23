"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ReimbursementForm } from "@/components/reimbursements/ReimbursementForm";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { useSessions } from "@/hooks/useSessions";
import { canRequestReimbursement } from "@/lib/auth/permissions";

export default function NewReimbursementPage() {
  return (
    <Suspense fallback={<p className="px-4 pt-4 text-sm text-muted">Loading…</p>}>
      <NewReimbursementInner />
    </Suspense>
  );
}

function NewReimbursementInner() {
  const user = useCurrentUser();
  const sessionId = useSearchParams().get("session_id");
  const { sessions, isLoading } = useSessions();

  if (!canRequestReimbursement(user)) {
    return <p className="px-4 pt-4 text-sm text-muted">This account cannot file reimbursements.</p>;
  }
  // Wait for the session so the form can prefill who played and the date.
  if (sessionId && isLoading) return <p className="px-4 pt-4 text-sm text-muted">Loading…</p>;
  const fromSession = sessionId ? sessions.find((s) => s.session_id === sessionId) : undefined;

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <h1 className="text-xl font-semibold text-foreground">Add reimbursement</h1>
      <ReimbursementForm fromSession={fromSession} />
    </main>
  );
}
