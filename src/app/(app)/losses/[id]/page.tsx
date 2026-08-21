"use client";

import { use } from "react";
import Link from "next/link";
import { useLossReports } from "@/hooks/useLossReports";
import { useLossEvidence } from "@/hooks/useLossEvidence";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { canReviewLossReport, ownsLossReport } from "@/lib/auth/permissions";
import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/decimal";
import { canonicalCasino } from "@/lib/names";
import { formatDateTimeForDisplay } from "@/lib/dates";
import { formatReportingDelay, LOSS_STATUS_LABEL, reportingDelayMs } from "@/lib/losses";
import { EvidenceGallery } from "@/components/losses/EvidenceGallery";
import { ReviewActions } from "@/components/losses/ReviewActions";
import type { LossStatus } from "@/lib/validation/schemas";

function statusTone(status: LossStatus): "neutral" | "warning" | "danger" | "accent" {
  if (status === "submitted") return "warning";
  if (status === "in_review") return "accent";
  if (status === "disputed") return "danger";
  if (status === "rejected") return "neutral";
  return "accent";
}

export default function LossDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = useCurrentUser();
  const { id } = use(params);
  const { reports, isLoading } = useLossReports();
  const { evidence } = useLossEvidence(id);

  const report = reports.find((row) => row.loss_id === id);

  if (isLoading) return <p className="px-4 pt-4 text-sm text-muted">Loading…</p>;
  if (!report) return <p className="px-4 pt-4 text-sm text-muted">Report not found.</p>;

  const delay = reportingDelayMs(report);
  const canAttach = report.status === "submitted" && (ownsLossReport(user, report) || user.role === "admin");

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 pt-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {report.casino ? canonicalCasino(report.casino) : "Loss report"}
          </h1>
          <p className="text-sm text-muted">
            {report.table_no ? `Table ${report.table_no} · ` : ""}
            Filed by {report.submitted_by || "—"}
          </p>
        </div>
        <Badge tone={statusTone(report.status)}>{LOSS_STATUS_LABEL[report.status]}</Badge>
      </div>

      <section className="space-y-2 rounded-2xl border border-border bg-surface p-4 text-sm">
        <Row label="Amount" value={formatMoney(report.amount)} valueClass="num font-semibold text-red-400" />
        <Row label="Occurred" value={formatDateTimeForDisplay(report.occurred_at)} />
        <Row label="Reported" value={formatDateTimeForDisplay(report.reported_at)} />
        <Row label="Delay" value={formatReportingDelay(delay)} />
        {report.witness_name ? <Row label="Witness" value={report.witness_name} /> : null}
        {report.session_id ? (
          <div className="flex justify-between gap-3">
            <span className="text-muted">Session</span>
            <Link href={`/sessions/${report.session_id}`} className="font-medium text-emerald-400">
              Open session
            </Link>
          </div>
        ) : null}
        {report.circumstances ? (
          <p className="border-t border-border pt-2 whitespace-pre-wrap text-foreground">{report.circumstances}</p>
        ) : null}
      </section>

      <EvidenceGallery lossId={report.loss_id} evidence={evidence} canAttach={canAttach} />

      {canReviewLossReport(user) ? <ReviewActions report={report} /> : null}
    </main>
  );
}

function Row({ label, value, valueClass = "font-medium text-foreground" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}
