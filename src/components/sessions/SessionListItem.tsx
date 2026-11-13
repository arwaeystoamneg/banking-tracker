import { RunningFor } from "@/components/sessions/RunningFor";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { SessionTagBadges } from "@/components/sessions/SessionTags";
import { isSessionOpen, loggedOnBehalf, sessionPlayerName } from "@/lib/sessionHelpers";
import { formatDateForDisplay, formatTimeRange } from "@/lib/dates";
import { d, formatMoney } from "@/lib/decimal";
import type { Session } from "@/lib/validation/schemas";

const ROW =
  "block w-full rounded-2xl border bg-surface p-4 text-left transition-colors active:border-border-strong active:bg-surface-raised";

/**
 * One session row — shared by the flat list and the expanded trip view. In select mode it's a checkbox
 * row for marking many sessions at once instead of a link.
 */
export function SessionListItem({
  session,
  selected,
  onToggle,
}: {
  session: Session;
  /** Set (with onToggle) to show the row in select mode. */
  selected?: boolean;
  onToggle?: () => void;
}) {
  const open = isSessionOpen(session);
  const cashDifference = session.buy_out === null ? null : d(session.buy_out).minus(session.buy_in);
  const coverage = session.coverage_pct;
  const underbanked = coverage !== null && coverage !== undefined && coverage < 1;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        {onToggle ? (
          <span
            aria-hidden
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm ${
              selected ? "border-emerald-500 bg-emerald-600 text-white" : "border-border-strong"
            }`}
          >
            {selected ? "✓" : ""}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium text-foreground">{sessionPlayerName(session) || "Unknown player"}</p>
          <p className="truncate text-sm text-muted">
            <span className="num">{formatDateForDisplay(session.date)}</span> · {formatTimeRange(session.time_in, session.time_out)}
          </p>
          {loggedOnBehalf(session) ? <p className="text-xs text-muted">Logged by {session.logged_by}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {open ? <Badge tone="warning">Open</Badge> : <Badge tone="accent">Closed</Badge>}
          <SessionTagBadges session={session} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
        {open ? (
          <span>
            <span className="text-xs text-muted">In </span>
            <span className="num font-semibold text-foreground">{formatMoney(session.buy_in)}</span>
            <RunningFor date={session.date} timeIn={session.time_in} />
          </span>
        ) : null}
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
    </>
  );

  if (onToggle) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={Boolean(selected)}
        onClick={onToggle}
        className={`${ROW} ${selected ? "border-emerald-500/70" : "border-border"}`}
      >
        {body}
      </button>
    );
  }
  return (
    <Link href={`/sessions/${session.session_id}`} className={`${ROW} border-border`}>
      {body}
    </Link>
  );
}
