"use client";

import { useState } from "react";
import { usePaytables } from "@/hooks/usePaytables";
import { Button } from "@/components/ui/Button";
import { isPlaceholderPaytableLine } from "@/lib/payout";
import type { Paytable } from "@/lib/validation/schemas";

export function PaytableGrid({ sidebetId, readOnly = false }: { sidebetId: string; readOnly?: boolean }) {
  const { paytables, isLoading, create, update, remove } = usePaytables(sidebetId);
  const rows = [...paytables].sort((a, b) => a.ordinal - b.ordinal);
  const [error, setError] = useState("");
  const invalid = rows.filter((row) => isPlaceholderPaytableLine(row.outcome, row.payout));

  async function deleteRow(row: Paytable) {
    setError("");
    try {
      await remove(row.paytable_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that paytable line.");
    }
  }

  async function deleteInvalid() {
    if (invalid.length === 0) return;
    if (!window.confirm(`Delete ${invalid.length} invalid paytable line${invalid.length === 1 ? "" : "s"}?`)) return;
    setError("");
    try {
      for (const row of invalid) await remove(row.paytable_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete invalid paytable lines.");
    }
  }

  return (
    <div className="space-y-2">
      {isLoading ? (
        <p className="text-xs text-muted">Loading paytable…</p>
      ) : rows.length > 0 ? (
        <>
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            <span>Outcome</span>
            <span className="w-24 text-right">Payout</span>
            <span className="w-16" />
          </div>
          {rows.map((row) => {
            const placeholder = isPlaceholderPaytableLine(row.outcome, row.payout);
            return (
              <div key={row.paytable_id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                <input
                  readOnly={readOnly}
                  defaultValue={row.outcome === "(invalid)" ? "" : row.outcome}
                  onBlur={(e) => {
                    if (readOnly || e.target.value === row.outcome) return;
                    void update(row.paytable_id, { outcome: e.target.value }, row._row_version);
                  }}
                  className={`h-10 rounded-lg border bg-surface-inset px-2 text-sm text-foreground outline-none focus:border-emerald-500/70 ${
                    placeholder ? "border-amber-500/50" : "border-border"
                  }`}
                  placeholder="Outcome"
                />
                <input
                  readOnly={readOnly}
                  defaultValue={row.payout}
                  onBlur={(e) => {
                    if (readOnly || e.target.value === row.payout) return;
                    void update(row.paytable_id, { payout: e.target.value }, row._row_version);
                  }}
                  className={`num h-10 w-24 rounded-lg border bg-surface-inset px-2 text-right text-sm font-semibold text-foreground outline-none focus:border-emerald-500/70 ${
                    placeholder ? "border-amber-500/50" : "border-border"
                  }`}
                  placeholder="—"
                />
                {readOnly ? (
                  <span className="w-16" />
                ) : (
                  <button
                    type="button"
                    onClick={() => void deleteRow(row)}
                    className={`h-10 min-w-16 px-1 text-xs font-medium ${
                      placeholder ? "text-amber-400 active:text-red-400" : "text-muted active:text-red-400"
                    }`}
                    aria-label={placeholder ? "Delete invalid paytable line" : "Remove paytable line"}
                  >
                    {placeholder ? "Delete" : "✕"}
                  </button>
                )}
              </div>
            );
          })}
          {invalid.length > 0 && !readOnly ? (
            <button
              type="button"
              onClick={() => void deleteInvalid()}
              className="px-2 text-xs font-medium text-amber-400 active:text-red-400"
            >
              Delete {invalid.length} invalid line{invalid.length === 1 ? "" : "s"}
            </button>
          ) : null}
        </>
      ) : (
        <p className="px-2 text-xs text-muted">No paytable rows — a side bet with no captured payouts is unquantified tail risk.</p>
      )}
      {error ? <p className="px-2 text-xs text-red-400">{error}</p> : null}
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