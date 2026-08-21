import { formatMoney, formatPercent } from "@/lib/decimal";
import { SignificanceBadge } from "@/components/rollups/SignificanceBadge";
import type { RollupResult } from "@/lib/math/rollup";

export function EdgeSummaryTable({ rollup }: { rollup: RollupResult }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <SignificanceBadge isMeaningful={rollup.isMeaningful} tStat={rollup.tStat.toNumber()} />

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Row label="Rounds banked" value={String(rollup.roundCount)} />
        <Row label="Coverage" value={rollup.coveragePct ? formatPercent(rollup.coveragePct, 1) : "—"} />
        <Row label="Realized edge" value={rollup.realizedEdgePct ? formatEdge(rollup, "realizedEdgePct") : "—"} />
        <Row label="Fee load" value={rollup.feeLoadPct ? formatEdge(rollup, "feeLoadPct") : "—"} />
        <Row label="Net edge" value={rollup.netEdgePct ? formatEdge(rollup, "netEdgePct") : "—"} tone={rollup.netEdgePct} />
        <Row label="$ / banked round" value={rollup.dollarPerRound ? formatMoney(rollup.dollarPerRound) : "—"} tone={rollup.dollarPerRound} />
      </div>

      {!rollup.isMeaningful ? (
        <p className="text-xs text-amber-400">
          Small samples here are overwhelmingly noise — treat the numbers above as directional, not a verdict, until
          |t| crosses ~2.
        </p>
      ) : null}
    </div>
  );
}

function formatEdge(rollup: RollupResult, key: "realizedEdgePct" | "feeLoadPct" | "netEdgePct"): string {
  const value = rollup[key];
  return value ? formatPercent(value) : "—";
}

function Row({ label, value, tone }: { label: string; value: string; tone?: { isNegative(): boolean } | null }) {
  const negative = tone?.isNegative() ?? false;
  const toneClass = tone ? (negative ? "text-red-400" : "text-emerald-400") : "text-foreground";
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-base font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
