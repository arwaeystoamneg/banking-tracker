"use client";

import { useState } from "react";
import type { Paytable, Sidebet } from "@/lib/validation/schemas";
import { VerifiedBadge } from "@/components/games/VerifiedBadge";
import { PaytableGrid } from "@/components/games/PaytableGrid";
import { Button } from "@/components/ui/Button";
import { maxPayoutMultiple } from "@/lib/payout";
import { highValueSidebetTag } from "@/lib/gameFamily";
import { useSidebets } from "@/hooks/useSidebets";
import { usePaytables } from "@/hooks/usePaytables";

/**
 * A side bet, framed as the bank's liability rather than a prize (domain doc §6). High-value
 * banker bets (BBJ, HPC 9/7 · 9/1 tagged 44 HE) are highlighted so they read first on a dim floor.
 */
export function SidebetCard({ sidebet, rows, readOnly = false }: { sidebet: Sidebet; rows: Paytable[]; readOnly?: boolean }) {
  const { update, remove } = useSidebets(sidebet.game_id);
  const { remove: removePaytable } = usePaytables(sidebet.sidebet_id);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const highValueTag = highValueSidebetTag(sidebet.name);
  const highValue = highValueTag !== null;
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

  async function handleDelete() {
    if (!window.confirm(`Delete ${sidebet.name}? Its paytable lines will be deleted too.`)) return;
    setDeleting(true);
    setError("");
    try {
      for (const row of rows) await removePaytable(row.paytable_id);
      await remove(sidebet.sidebet_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that side bet.");
      setDeleting(false);
    }
  }

  return (
    <div
      className={`space-y-3 rounded-2xl border bg-surface p-4 ${
        highValue ? "border-lime-400/40" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <input
          defaultValue={sidebet.name}
          readOnly={readOnly}
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (!readOnly && name && name !== sidebet.name) {
              void update(sidebet.sidebet_id, { name }, sidebet._row_version);
            }
          }}
          className={`h-10 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm font-semibold outline-none focus:border-border ${
            highValue ? "text-lime-300" : "text-foreground"
          }`}
        />
        {highValueTag ? (
          <span className="shrink-0 rounded-full border border-lime-400/40 bg-lime-500/15 px-2 py-0.5 text-[11px] font-medium text-lime-300">
            {highValueTag}
          </span>
        ) : null}
        <VerifiedBadge verified={sidebet.verified} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Edge (%)
          <input
            defaultValue={sidebet.edge_pct * 100}
            readOnly={readOnly}
            inputMode="decimal"
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (!readOnly && Number.isFinite(value) && value / 100 !== sidebet.edge_pct) {
                void update(sidebet.sidebet_id, { edge_pct: value / 100 }, sidebet._row_version);
              }
            }}
            className="mt-1 h-10 w-full rounded-lg border border-border bg-surface-inset px-2 text-sm text-foreground"
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={sidebet.verified}
            disabled={readOnly}
            onChange={(event) =>
              void update(sidebet.sidebet_id, { verified: event.target.checked }, sidebet._row_version)
            }
            className="h-5 w-5 accent-emerald-600"
          />
          Verified
        </label>
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

      <PaytableGrid sidebetId={sidebet.sidebet_id} readOnly={readOnly} />

      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      {!readOnly ? (
        <Button
          type="button"
          variant="danger"
          className="h-10 w-full text-xs"
          disabled={deleting}
          onClick={() => void handleDelete()}
        >
          {deleting ? "Deleting…" : "Delete side bet"}
        </Button>
      ) : null}
    </div>
  );
}
