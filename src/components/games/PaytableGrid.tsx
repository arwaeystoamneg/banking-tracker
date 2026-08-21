"use client";

import { usePaytables } from "@/hooks/usePaytables";
import { Button } from "@/components/ui/Button";

export function PaytableGrid({ sidebetId }: { sidebetId: string }) {
  const { paytables, isLoading, create, update, remove } = usePaytables(sidebetId);
  const rows = [...paytables].sort((a, b) => a.ordinal - b.ordinal);

  return (
    <div className="space-y-2">
      {isLoading ? (
        <p className="text-xs text-muted">Loading paytable…</p>
      ) : (
        rows.map((row) => (
          <div key={row.paytable_id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
            <input
              defaultValue={row.outcome}
              onBlur={(e) => {
                if (e.target.value !== row.outcome) void update(row.paytable_id, { outcome: e.target.value }, row._row_version);
              }}
              className="h-10 rounded-lg border border-border bg-surface px-2 text-sm text-foreground outline-none focus:border-neutral-500"
              placeholder="Outcome"
            />
            <input
              defaultValue={row.payout}
              onBlur={(e) => {
                if (e.target.value !== row.payout) void update(row.paytable_id, { payout: e.target.value }, row._row_version);
              }}
              className="h-10 w-24 rounded-lg border border-border bg-surface px-2 text-sm text-foreground outline-none focus:border-neutral-500"
              placeholder="Payout"
            />
            <button onClick={() => void remove(row.paytable_id)} className="h-10 w-10 text-muted active:text-red-400">
              ✕
            </button>
          </div>
        ))
      )}
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
    </div>
  );
}
