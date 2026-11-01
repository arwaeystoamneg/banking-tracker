"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useSessions } from "@/hooks/useSessions";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { canMarkPayrollPaid } from "@/lib/payroll";
import type { Session } from "@/lib/validation/schemas";

/** For a session logged by mistake. First tap asks; second deletes. Paid sessions are left to Ray or admin. */
export function DeleteSessionButton({ session }: { session: Session }) {
  const user = useCurrentUser();
  const router = useRouter();
  const { remove } = useSessions();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (session.payroll_paid_at && !canMarkPayrollPaid(user)) return null;

  async function handle() {
    if (!confirm) {
      setConfirm(true);
      setTimeout(() => setConfirm(false), 5000);
      return;
    }
    setBusy(true);
    try {
      await remove(session.session_id);
      router.replace("/sessions");
    } catch {
      setError("Could not delete. Check sync status and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button variant={confirm ? "danger" : "ghost"} onClick={handle} disabled={busy} className={`w-full ${confirm ? "" : "text-red-400"}`}>
        {confirm ? "Tap again to delete this session" : "Delete session"}
      </Button>
      {error ? <p className="text-center text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
