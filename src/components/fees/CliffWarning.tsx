import { formatMoney } from "@/lib/decimal";
import type { CliffBoundary } from "@/lib/fees/cliff";

export function CliffWarning({ cliff, isNear }: { cliff: CliffBoundary | null; isNear: boolean }) {
  if (!cliff) {
    return (
      <p className="rounded-xl border border-border bg-surface-inset px-3 py-2.5 text-sm text-muted">
        Top fee tier — no upcoming cliff.
      </p>
    );
  }

  const rakePct = cliff.marginalRake.times(100).toFixed(0);

  if (!isNear) {
    return (
      <p className="rounded-xl border border-border bg-surface-inset px-3 py-2.5 text-sm text-muted">
        Next tier at <span className="num text-muted-strong">{formatMoney(cliff.nextTierMin)}</span> —{" "}
        <span className="num">{formatMoney(cliff.dollarsToCliff)}</span> of headroom.
        Crossing it costs <span className="num">{rakePct}%</span> marginal rake.
      </p>
    );
  }

  return (
    <div className="cliff-alert rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4">
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none" aria-hidden>
          ⚠
        </span>
        <p className="text-base font-semibold text-amber-300">
          <span className="num">{formatMoney(cliff.dollarsToCliff)}</span> from a fee cliff
        </p>
      </div>
      <p className="mt-1.5 text-sm text-amber-200/90">
        Next tier at <span className="num font-semibold">{formatMoney(cliff.nextTierMin)}</span>. That last bit of action
        gets raked at <span className="num font-semibold">{rakePct}%</span> — hold below the boundary.
      </p>
    </div>
  );
}
