import type { Decimal } from "@/lib/decimal";

export function MarginalRakeDisplay({ tierFee, rake }: { tierFee: Decimal | null; rake: Decimal | null }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-border bg-surface p-3">
        <p className="text-xs text-muted">Current tier fee</p>
        <p className="mt-1 text-lg font-semibold text-foreground">{tierFee ? `$${tierFee.toFixed(2)}` : "—"}</p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-3">
        <p className="text-xs text-muted">Marginal rake at boundary</p>
        <p className="mt-1 text-lg font-semibold text-foreground">{rake ? `${rake.times(100).toFixed(0)}%` : "—"}</p>
      </div>
    </div>
  );
}
