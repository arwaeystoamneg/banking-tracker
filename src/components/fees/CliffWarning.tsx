import { formatMoney } from "@/lib/decimal";
import type { CliffBoundary } from "@/lib/fees/cliff";

export function CliffWarning({ cliff, isNear }: { cliff: CliffBoundary | null; isNear: boolean }) {
  if (!cliff) {
    return <p className="text-sm text-muted">Already in the top fee tier — no upcoming cliff.</p>;
  }

  if (!isNear) {
    return (
      <p className="text-sm text-muted">
        Next tier at {formatMoney(cliff.nextTierMin)} ({formatMoney(cliff.dollarsToCliff)} away).
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
      <p className="text-sm font-semibold text-amber-300">
        ⚠ {formatMoney(cliff.dollarsToCliff)} from the next fee tier at {formatMoney(cliff.nextTierMin)}
      </p>
      <p className="mt-1 text-xs text-amber-200/80">
        Crossing it costs {cliff.marginalRake.times(100).toFixed(0)}% marginal rake on that last bit of action.
      </p>
    </div>
  );
}
