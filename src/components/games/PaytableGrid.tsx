"use client";

import { usePaytables } from "@/hooks/usePaytables";
import { Button } from "@/components/ui/Button";

export function PaytableGrid({ sidebetId, readOnly = false }: { sidebetId: string; readOnly?: boolean }) {
  const { paytables, isLoading, create, update, remove } = usePaytables(sidebetId);
  const rows = [...paytables].sort((a, b) => a.ordinal - b.ordinal);

  return (
    <div className="space-y-2">
      {isLoading ? (
        <p className="text-xs text-muted">Loading paytable…</p>
      ) : rows.length > 0 ? (
        <>
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            <span>Outcome</span>
            <span className="w-24 text-right">Payout</span>
            <span className="w-10" />
          </div>
          {rows.map((row) => (
            <div key={row.paytable_id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
              <input
                readOnly={readOnly}
                defaultValue={row.outcome}
                onBlur={(e) => {
                  if (readOnly || e.target.value === row.outcome) return;
                  void update(row.paytable_id, { outcome: e.target.value }, row._row_version);
                }}
                className="h-10 rounded-lg border border-border bg-surface-inset px-2 text-sm text-foreground outline-none focus:border-emerald-500/70"
                placeholder="Outcome"
              />
              <input
                readOnly={readOnly}
                defaultValue={row.payout}
                onBlur={(e) => {
                  if (readOnly || e.target.value === row.payout) return;
                  void update(row.paytable_id, { payout: e.target.value }, row._row_version);
                }}
                className="num h-10 w-24 rounded-lg border border-border bg-surface-inset px-2 text-right text-sm font-semibold text-foreground outline-none focus:border-emerald-500/70"
                placeholder="—"
              />
              {readOnly ? <span className="w-10" /> : (
                <button onClick={() => void remove(row.paytable_id)} className="h-10 w-10 text-muted active:text-red-400" aria-label="Remove row">
                  ✕
                </button>
              )}
            </div>
          ))}
        </>
      ) : (
        <p className="px-2 text-xs text-muted">No paytable rows — a side bet with no captured payouts is unquantified tail risk.</p>
      )}
      {!readOnly ? (
        <Button
          variant="secondary"
          className="h-9 text-xs"
          onClick={() =>
            void create({
              sidebet_id: sidebetId,
              ordinal: rows.length > 0 ? Math.max(...rows.map((r) => r.ordinal)) + 1 : 1,
              outcome: "New outcome",
              payout: "",
            })
          }
        >
          + Add paytable row
        </Button>
      ) : null}
    </div>
  );
}
