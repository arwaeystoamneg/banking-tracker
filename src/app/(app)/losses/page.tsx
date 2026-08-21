"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLossReports } from "@/hooks/useLossReports";
import { useLossEvidence } from "@/hooks/useLossEvidence";
import { Button } from "@/components/ui/Button";
import { LossListItem } from "@/components/losses/LossListItem";
import { UnreportedLosses } from "@/components/losses/UnreportedLosses";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { canSeeAllLossReports, canSubmitLossReport } from "@/lib/auth/permissions";
import { compareLossQueue } from "@/lib/losses";

export default function LossesPage() {
  const user = useCurrentUser();
  const { reports, isLoading } = useLossReports();
  const { evidence } = useLossEvidence();
  const canFile = canSubmitLossReport(user);

  const counts = useMemo(() => {
    const byLoss = new Map<string, number>();
    for (const row of evidence) {
      byLoss.set(row.loss_id, (byLoss.get(row.loss_id) ?? 0) + 1);
    }
    return byLoss;
  }, [evidence]);

  const sorted = useMemo(() => [...reports].sort(compareLossQueue), [reports]);

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Loss reports</h1>
          <p className="text-sm text-muted">
            {isLoading
              ? "Loading…"
              : `${reports.length} report${reports.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {canFile ? (
          <Link href="/losses/new">
            <Button className="h-10 px-4 text-sm">+ New</Button>
          </Link>
        ) : null}
      </div>

      {canSeeAllLossReports(user) ? <UnreportedLosses /> : null}

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted">
          {canFile ? "No loss reports yet." : "No reports to review."}
        </p>
      ) : (
        <div className="space-y-3">
          {sorted.map((report) => (
            <LossListItem
              key={report.loss_id}
              report={report}
              evidenceCount={counts.get(report.loss_id) ?? 0}
            />
          ))}
        </div>
      )}
    </main>
  );
}
