import type { Paytable, Sidebet } from "@/lib/validation/schemas";
import { VerifiedBadge } from "@/components/games/VerifiedBadge";
import { PaytableGrid } from "@/components/games/PaytableGrid";
import { maxPayoutMultiple } from "@/lib/payout";

/**
 * A side bet, framed as the bank's liability rather than a prize (domain doc §6). The worst-case tail —
 * the largest funded multiple across the paytable — is the headline, because a 200:1 or 8000:1 line can
 * exceed the entire bank on a single hand. The named top payout is secondary; the exposure is the point.
 */
export function SidebetCard({ sidebet, rows }: { sidebet: Sidebet; rows: Paytable[] }) {
  const maxMultiple = maxPayoutMultiple(rows.map((r) => r.payout));
  const tone =
    maxMultiple === null
      ? "muted"
      : maxMultiple >= 100
        ? "danger"
        : maxMultiple >= 10
          ? "warning"
          : "neutral";

  const toneClasses: Record<string, string> = {
    danger: "border-red-500/40 bg-red-500/10 text-red-300",
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    neutral: "border-border bg-surface-inset text-muted-strong",
    muted: "border-border bg-surface-inset text-muted",
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{sidebet.name}</h3>
        <VerifiedBadge verified={sidebet.verified} />
      </div>

      <div className={`flex items-baseline justify-between gap-3 rounded-xl border px-3 py-2 ${toneClasses[tone]}`}>
        <span className="text-[11px] font-medium uppercase tracking-wide">Max exposure</span>
        <span className="num text-lg font-semibold">
          {maxMultiple === null ? "—" : `×${maxMultiple.toLocaleString()}`}
          <span className="ml-1 text-xs font-normal opacity-80">per $1</span>
        </span>
      </div>

      {sidebet.top_payout ? (
        <p className="text-xs text-muted">
          Top line: <span className="text-muted-strong">{sidebet.top_payout}</span>
        </p>
      ) : null}
      {sidebet.note ? <p className="text-xs text-amber-400/90">{sidebet.note}</p> : null}

      <PaytableGrid sidebetId={sidebet.sidebet_id} />
    </div>
  );
}
