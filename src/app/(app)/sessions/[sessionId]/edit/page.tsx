"use client";

import { use } from "react";
import Link from "next/link";
import { SessionForm } from "@/components/sessions/SessionForm";
import { useSessions } from "@/hooks/useSessions";

export default function EditSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { sessions, isLoading } = useSessions();
  const session = sessions.find((item) => item.session_id === sessionId);

  if (isLoading) return <p className="px-4 pt-4 text-sm text-muted">Loading…</p>;
  if (!session) return <p className="px-4 pt-4 text-sm text-muted">Session not found (try syncing).</p>;

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Edit session</h1>
        <Link href={`/sessions/${sessionId}`} className="px-2 py-2 text-sm text-muted">
          Cancel
        </Link>
      </div>
      <SessionForm key={`${session.session_id}-${session._row_version}`} session={session} />
    </main>
  );
}
