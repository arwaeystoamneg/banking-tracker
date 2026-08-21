"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LossForm } from "@/components/losses/LossForm";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { useSessions } from "@/hooks/useSessions";
import { canSubmitLossReport } from "@/lib/auth/permissions";
import { isPrivilegedUser } from "@/lib/auth/types";

export default function NewLossPage() {
  return (
    <Suspense fallback={<p className="px-4 pt-4 text-sm text-muted">Loading…</p>}>
      <NewLossPageInner />
    </Suspense>
  );
}

function NewLossPageInner() {
  const user = useCurrentUser();
  const sessionId = useSearchParams().get("session_id");

  if (!canSubmitLossReport(user)) {
    return <p className="px-4 pt-4 text-sm text-muted">This account cannot file loss reports.</p>;
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <h1 className="text-xl font-semibold text-foreground">Report a loss</h1>
      {isPrivilegedUser(user) && sessionId ? <LinkedLossForm sessionId={sessionId} /> : <LossForm />}
    </main>
  );
}

function LinkedLossForm({ sessionId }: { sessionId: string }) {
  const { sessions, isLoading } = useSessions();
  const session = sessions.find((row) => row.session_id === sessionId);
  if (isLoading) return <p className="text-sm text-muted">Loading session…</p>;
  return <LossForm session={session} />;
}
