import { d, Decimal } from "@/lib/decimal";
import type { FeeTier } from "@/lib/fees/cliff";

function fmtBound(v: Decimal.Value): string {
  const n = d(v);
  return n.isInteger() ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;
}

function rangeLabel(min: Decimal, max: Decimal | null): string {
  if (max === null) return `${fmtBound(min)}+`;
  return `${fmtBound(min)} – ${fmtBound(max)}`;
}

function rakeChip(rake: Decimal): { text: string; cls: string } {
  const pct = rake.times(100);
  if (rake.greaterThanOrEqualTo(1)) {
    return { text: `+${pct.toFixed(0)}% cliff`, cls: "border-red-500/40 bg-red-500/10 text-red-400" };
  }
  if (rake.greaterThanOrEqualTo(0.5)) {
    return { text: `+${pct.toFixed(0)}%`, cls: "border-amber-500/40 bg-amber-500/10 text-amber-400" };
  }
  return { text: `+${pct.toFixed(0)}%`, cls: "border-border bg-surface-inset text-muted" };
}

/**
 * The full fee schedule as a ladder, current tier highlighted. Between adjacent tiers we surface the
 * boundary's marginal rake (Δfee / Δaction) — the filed tiers produce genuinely punitive steps, and
 * seeing the whole shape at once is how you decide where to sit before the button reaches you.
 */
export function FeeTierLadder({ tiers, currentScheduleId }: { tiers: FeeTier[]; currentScheduleId: string | null }) {
  const sorted = [...tiers]
    .map((t) => ({ ...t, tierMin: d(t.tierMin), tierMax: t.tierMax === null ? null : d(t.tierMax), pdFee: d(t.pdFee) }))
    .sort((a, b) => a.tierMin.comparedTo(b.tierMin));

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted">
        <span>Action tier</span>
        <span>PD fee</span>
      </div>
      <ul>
        {sorted.map((tier, i) => {
          const isCurrent = currentScheduleId === tier.scheduleId;
          const next = sorted[i + 1];
          let chip: { text: string; cls: string } | null = null;
          if (next && tier.tierMax !== null) {
            const deltaAction = next.tierMin.minus(tier.tierMax);
            if (deltaAction.greaterThan(0)) {
              chip = rakeChip(next.pdFee.minus(tier.pdFee).dividedBy(deltaAction));
            }
          }
          return (
            <li key={tier.scheduleId}>
              <div
                className={`flex items-center justify-between px-4 py-2.5 ${
                  isCurrent ? "border-l-2 border-emerald-400 bg-emerald-500/10" : "border-l-2 border-transparent"
                }`}
              >
                <span className={`num text-sm ${isCurrent ? "font-semibold text-emerald-300" : "text-foreground"}`}>
                  {rangeLabel(tier.tierMin, tier.tierMax)}
                  {isCurrent ? <span className="ml-2 text-[11px] font-medium text-emerald-400">← here</span> : null}
                </span>
                <span className={`num text-sm ${isCurrent ? "font-semibold text-emerald-300" : "text-muted-strong"}`}>
                  ${tier.pdFee.toFixed(2)}
                </span>
              </div>
              {chip ? (
                <div className="flex items-center gap-2 px-4 pb-1">
                  <span className="h-px flex-1 bg-border" aria-hidden />
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${chip.cls}`}>{chip.text}</span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
