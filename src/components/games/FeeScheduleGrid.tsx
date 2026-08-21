"use client";

import { useFeeSchedules } from "@/hooks/useFeeSchedules";
import { Button } from "@/components/ui/Button";
import type { FeeSchedule } from "@/lib/validation/schemas";

function NumberCell({
  value,
  onCommit,
  placeholder,
  width = "w-20",
  readOnly = false,
}: {
  value: number | null;
  onCommit: (n: number | null) => void;
  placeholder?: string;
  width?: string;
  readOnly?: boolean;
}) {
  return (
    <input
      defaultValue={value ?? ""}
      placeholder={placeholder}
      inputMode="decimal"
      readOnly={readOnly}
      onBlur={(e) => {
        if (readOnly) return;
        const raw = e.target.value.trim();
        const next = raw === "" ? null : Number(raw);
        if (next !== null && !Number.isFinite(next)) return;
        if (next !== value) onCommit(next);
      }}
      className={`h-10 ${width} rounded-lg border border-border bg-surface px-2 text-sm text-foreground outline-none focus:border-neutral-500`}
    />
  );
}

export function FeeScheduleGrid({ gameId, readOnly = false }: { gameId: string; readOnly?: boolean }) {
  const { feeSchedules, isLoading, create, update, remove } = useFeeSchedules(gameId);
  const rows = [...feeSchedules].sort((a, b) => a.tier_min - b.tier_min);

  function patch(row: FeeSchedule, changes: Partial<FeeSchedule>) {
    void update(row.schedule_id, changes, row._row_version);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Fee tiers entered here power the cliff calculator. No real schedule is pre-filled — enter what&apos;s
        actually posted at the table.
      </p>

      {isLoading ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted">No fee schedule entered yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.schedule_id} className="rounded-xl border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <input
                  readOnly={readOnly}
                  defaultValue={row.option_label}
                  placeholder="Option label"
                  onBlur={(e) => e.target.value !== row.option_label && patch(row, { option_label: e.target.value })}
                  className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-neutral-500"
                />
                {!readOnly ? (
                  <button onClick={() => void remove(row.schedule_id)} className="h-9 w-9 text-muted active:text-red-400">
                    ✕
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="text-xs text-muted">
                  Min
                  <NumberCell value={row.tier_min} onCommit={(n) => patch(row, { tier_min: n ?? 0 })} width="w-full" readOnly={readOnly} />
                </label>
                <label className="text-xs text-muted">
                  Max (blank = open)
                  <NumberCell value={row.tier_max} onCommit={(n) => patch(row, { tier_max: n })} width="w-full" readOnly={readOnly} />
                </label>
                <label className="text-xs text-muted">
                  PD fee
                  <NumberCell value={row.pd_fee} onCommit={(n) => patch(row, { pd_fee: n ?? 0 })} width="w-full" readOnly={readOnly} />
                </label>
                <label className="text-xs text-muted">
                  Basis
                  <select
                    disabled={readOnly}
                    defaultValue={row.basis}
                    onChange={(e) => patch(row, { basis: e.target.value as "flat" | "tta" })}
                    className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-neutral-500"
                  >
                    <option value="tta">tta</option>
                    <option value="flat">flat</option>
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {!readOnly ? <Button
        variant="secondary"
        className="h-9 text-xs"
        onClick={() =>
          void create({
            game_id: gameId,
            casino: "",
            option_label: rows[0]?.option_label || "Option 1",
            table_limit: "",
            basis: "tta",
            tier_min: 0,
            tier_max: null,
            pd_fee: 0,
            player_fee: 0,
          })
        }
      >
        + Add fee tier
      </Button> : null}
    </div>
  );
}
