import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { isSessionOpen } from "@/lib/sessionHelpers";
import { formatDateForDisplay } from "@/lib/dates";
import { canonicalCasino } from "@/lib/names";
import { d, formatMoney } from "@/lib/decimal";
import type { Session } from "@/lib/validation/schemas";

/** One session row — shared by the flat list and the expanded trip view. */
export function SessionListItem({ session }: { session: Session }) {
  const open = isSessionOpen(session);
  const cashDifference = session.buy_out === null ? null : d(session.buy_out).minus(session.buy_in);
  const coverage = session.coverage_pct;
  const underbanked = coverage !== null && coverage !== undefined && coverage < 1;

  return (
    <Link
      href={`/sessions/${session.session_id}`}
      className="block rounded-2xl border border-border bg-surface p-4 transition-colors active:border-border-strong active:bg-surface-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-foreground">
            {session.casino ? canonicalCasino(session.casino) : "Casino session"}
          </p>
          <p className="text-sm text-muted">
            <span className="num">{formatDateForDisplay(session.date)}</span> · {session.time_in || "—"}
            {session.time_out ? `–${session.time_out}` : ""}
          </p>
          <p className="text-xs text-muted">Logged by {session.logged_by || "—"}</p>
        </div>
        {open ? <Badge tone="warning">Open</Badge> : <Badge tone="accent">Closed</Badge>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
        {cashDifference !== null ? (
          <span>
            <span className="text-xs text-muted">Net </span>
            <span className={`num font-semibold ${cashDifference.isNegative() ? "text-red-400" : "text-emerald-400"}`}>
              {formatMoney(cashDifference)}
            </span>
          </span>
        ) : null}
        {coverage !== null && coverage !== undefined ? (
          <span>
            <span className="text-xs text-muted">Coverage </span>
            <span className={`num font-semibold ${underbanked ? "text-amber-400" : "text-muted-strong"}`}>
              {(coverage * 100).toFixed(0)}%
            </span>
          </span>
        ) : null}
        {session.rounds_banked ? (
          <span>
            <span className="num font-semibold text-muted-strong">{session.rounds_banked}</span>
            <span className="text-xs text-muted"> rounds</span>
          </span>
        ) : null}
      </div>
    </Link>
  );
}
