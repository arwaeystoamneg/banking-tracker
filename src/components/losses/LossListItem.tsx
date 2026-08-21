import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/decimal";
import { canonicalCasino } from "@/lib/names";
import { formatDateTimeForDisplay } from "@/lib/dates";
import { formatReportingDelay, LOSS_STATUS_LABEL, reportingDelayMs } from "@/lib/losses";
import type { LossReport, LossStatus } from "@/lib/validation/schemas";

function statusTone(status: LossStatus): "neutral" | "warning" | "danger" | "accent" {
  if (status === "submitted") return "warning";
  if (status === "in_review") return "accent";
  if (status === "disputed") return "danger";
  if (status === "rejected") return "neutral";
  return "accent";
}

export function LossListItem({
  report,
  evidenceCount,
}: {
  report: LossReport;
  evidenceCount: number;
}) {
  const delay = reportingDelayMs(report);

  return (
    <Link
      href={`/losses/${report.loss_id}`}
      className="block rounded-2xl border border-border bg-surface p-4 transition-colors active:border-border-strong active:bg-surface-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-foreground">
            {report.casino ? canonicalCasino(report.casino) : "Loss report"}
            {report.table_no ? ` · table ${report.table_no}` : ""}
          </p>
          <p className="text-sm text-muted">
            Occurred {formatDateTimeForDisplay(report.occurred_at)} · {formatReportingDelay(delay)}
          </p>
          <p className="text-xs text-muted">Filed by {report.submitted_by || "—"}</p>
        </div>
        <Badge tone={statusTone(report.status)}>{LOSS_STATUS_LABEL[report.status]}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
        <span>
          <span className="text-xs text-muted">Amount </span>
          <span className="num font-semibold text-red-400">{formatMoney(report.amount)}</span>
        </span>
        <span>
          <span className="num font-semibold text-muted-strong">{evidenceCount}</span>
          <span className="text-xs text-muted"> photo{evidenceCount === 1 ? "" : "s"}</span>
        </span>
      </div>
    </Link>
  );
}
