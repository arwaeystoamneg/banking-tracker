"use client";

import { useState } from "react";
import { BackingEditor } from "@/components/backing/BackingEditor";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { useSessions } from "@/hooks/useSessions";
import { useReimbursements } from "@/hooks/useReimbursements";
import { canMarkPayrollPaid } from "@/lib/payroll";
import { describeBacking } from "@/lib/backing";
import type { Session } from "@/lib/validation/schemas";

/**
 * One split for a whole trip: Ray or admin sets it once and it goes on every session in the trip and every
 * reimbursement filed against one of them. Sessions can still be changed one by one afterwards.
 */
export function TripBackingControl({ sessions }: { sessions: Session[] }) {
  const user = useCurrentUser();
  const { update: updateSession } = useSessions();
  const { reimbursements, update: updateReimbursement } = useReimbursements();
  const [message, setMessage] = useState("");
  if (!canMarkPayrollPaid(user) || sessions.length === 0) return null;

  const ids = new Set(sessions.map((session) => session.session_id));
  const linked = reimbursements.filter((row) => row.session_id && ids.has(row.session_id));
  const splits = new Set([...sessions.map((session) => session.backing), ...linked.map((row) => row.backing)]);
  const shared = splits.size === 1 ? [...splits][0] : "";

  async function apply(backing: string) {
    setMessage("");
    let failed = 0;
    for (const session of sessions) {
      if (session.backing === backing) continue;
      try {
        await updateSession(session.session_id, { backing }, session._row_version);
      } catch {
        failed += 1;
      }
    }
    for (const row of linked) {
      if (row.backing === backing) continue;
      try {
        await updateReimbursement(row.reimbursement_id, { backing }, row._row_version);
      } catch {
        failed += 1;
      }
    }
    if (failed) throw new Error(`${failed} couldn't be saved; try again.`);
    setMessage(`Set on ${sessions.length} session${sessions.length === 1 ? "" : "s"}${linked.length ? ` and ${linked.length} reimbursement${linked.length === 1 ? "" : "s"}` : ""}.`);
  }

  return (
    <section className="space-y-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
      <BackingEditor
        value={shared}
        title="Backers for this trip"
        hint={
          splits.size > 1
            ? "Sessions on this trip have different splits now. Setting one here replaces them all, plus reimbursements filed against these sessions."
            : "Applies to every session on this trip and reimbursements filed against them."
        }
        saveLabel="Apply to the trip"
        onSave={apply}
      />
      {splits.size > 1 ? (
        <p className="text-xs text-muted">
          Now: {[...splits].map((split) => describeBacking(split)).join(" / ")}
        </p>
      ) : null}
      {message ? <p className="text-xs text-emerald-400">{message}</p> : null}
    </section>
  );
}
