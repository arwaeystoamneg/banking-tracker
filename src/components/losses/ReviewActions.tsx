"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useLossReports } from "@/hooks/useLossReports";
import { useAuditLog } from "@/hooks/useAuditLog";
import { LOSS_STATUS_LABEL, nextLossStatuses } from "@/lib/losses";
import { formatDateTimeForDisplay } from "@/lib/dates";
import type { LossDecisionStatus, LossReport } from "@/lib/validation/schemas";

const ACTION_LABEL: Record<LossDecisionStatus, string> = {
  in_review: "Mark in review",
  verified: "Verify",
  disputed: "Dispute",
  rejected: "Reject",
};

export function ReviewActions({ report }: { report: LossReport }) {
  const { decide } = useLossReports();
  const { entries } = useAuditLog(report.loss_id);
  const [note, setNote] = useState(report.review_note);
  const [busy, setBusy] = useState<LossDecisionStatus | null>(null);
  const [error, setError] = useState("");

  const next = nextLossStatuses(report.status);

  async function apply(status: LossDecisionStatus) {
    setBusy(status);
    setError("");
    try {
      await decide(
        report.loss_id,
        { status, review_note: note.trim(), second_attestor: "" },
        report._row_version,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record the decision.");
    } finally {
      setBusy(null);
    }
  }

  if (next.length === 0) {
    return (
      <section className="space-y-2 rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">Decision</h2>
        <p className="text-sm text-muted">
          This report is {LOSS_STATUS_LABEL[report.status].toLowerCase()}
          {report.reviewed_by ? ` by ${report.reviewed_by}` : ""}
          {report.reviewed_at ? ` · ${formatDateTimeForDisplay(report.reviewed_at)}` : ""}. A changed
          picture means a new report, not a re-decision.
        </p>
        {report.review_note ? <p className="whitespace-pre-wrap text-sm text-foreground">{report.review_note}</p> : null}
        <AuditTrail entries={entries} />
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">Review</h2>
      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Note</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full resize-y rounded-xl border border-border bg-surface-inset px-3.5 py-3 text-base text-foreground outline-none focus:border-emerald-500/70"
        />
      </label>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="grid grid-cols-2 gap-2">
        {next.map((status) => (
          <Button
            key={status}
            type="button"
            variant={status === "verified" ? "primary" : status === "rejected" || status === "disputed" ? "danger" : "secondary"}
            disabled={busy !== null}
            onClick={() => void apply(status)}
            className="h-11 text-sm"
          >
            {busy === status ? "Saving…" : ACTION_LABEL[status]}
          </Button>
        ))}
      </div>
      <AuditTrail entries={entries} />
    </section>
  );
}

function AuditTrail({ entries }: { entries: { entry_id: string; at: string; actor: string; from_status: string; to_status: string; note: string }[] }) {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => (a.at < b.at ? 1 : -1));
  return (
    <ol className="space-y-1 border-t border-border pt-3 text-xs text-muted">
      {sorted.map((entry) => (
        <li key={entry.entry_id}>
          {formatDateTimeForDisplay(entry.at)} · {entry.actor}: {entry.from_status || "—"} → {entry.to_status}
          {entry.note ? ` — ${entry.note}` : ""}
        </li>
      ))}
    </ol>
  );
}
