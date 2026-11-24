"use client";

import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useTeam } from "@/components/providers/AuthProvider";
import { useSessions } from "@/hooks/useSessions";
import { useReimbursements } from "@/hooks/useReimbursements";
import { backingProblem, describeBacking, formatBacking, parseBacking, UNASSIGNED } from "@/lib/backing";

/** Teammates plus every backer name already used, for the name suggestions. */
export function useBackerNames(): string[] {
  const team = useTeam();
  const { sessions } = useSessions();
  const { reimbursements } = useReimbursements();
  return useMemo(() => {
    const names = new Map<string, string>();
    const add = (name: string) => {
      const clean = name.trim();
      if (clean && !names.has(clean.toLowerCase())) names.set(clean.toLowerCase(), clean);
    };
    team.forEach((person) => add(person.name));
    for (const row of [...sessions, ...reimbursements]) parseBacking(row.backing).forEach((share) => add(share.name));
    return [...names.values()].sort((a, b) => a.localeCompare(b));
  }, [team, sessions, reimbursements]);
}

interface Row {
  name: string;
  pct: string;
}

const toRows = (backing: string): Row[] => parseBacking(backing).map((share) => ({ name: share.name, pct: String(share.pct) }));

/**
 * Who backs this (a session, a reimbursement, a whole trip): names and percentages that add up to 100. A backer
 * can be a teammate, the player themselves, or anyone typed in. Clearing it leaves it Unassigned.
 */
export function BackingEditor({
  value,
  onSave,
  title = "Backers",
  hint,
  saveLabel = "Save split",
}: {
  value: string;
  onSave: (backing: string) => Promise<void>;
  title?: string;
  hint?: string;
  saveLabel?: string;
}) {
  const names = useBackerNames();
  const listId = useId();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editing = rows !== null;

  const shares = (rows ?? []).map((row) => ({ name: row.name.trim(), pct: Number(row.pct) }));
  const filled = shares.filter((share) => share.name || share.pct);
  const total = filled.reduce((sum, share) => sum + (Number.isFinite(share.pct) ? share.pct : 0), 0);
  const problem = editing ? backingProblem(filled) : null;

  async function save(backing: string) {
    setSaving(true);
    setError("");
    try {
      await onSave(backing);
      setRows(null);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  function splitEvenly() {
    if (!rows?.length) return;
    const each = Math.floor((100 / rows.length) * 100) / 100;
    setRows(rows.map((row, i) => ({ ...row, pct: String(i === 0 ? Math.round((100 - each * (rows.length - 1)) * 100) / 100 : each) })));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted">{hint ?? "Who pays and keeps what share. Shares add up to 100%."}</p>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={() => setRows(value ? toRows(value) : [{ name: "", pct: "100" }])}
            className="min-h-9 shrink-0 text-sm font-medium text-emerald-400"
          >
            {value ? "Change" : "Set split"}
          </button>
        ) : null}
      </div>

      {!editing ? (
        <p className={`text-sm ${value ? "text-foreground" : "text-amber-400"}`}>{value ? describeBacking(value) : UNASSIGNED}</p>
      ) : (
        <div className="space-y-2">
          <datalist id={listId}>
            {names.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {rows!.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={row.name}
                list={listId}
                placeholder="Name"
                onChange={(e) => setRows(rows!.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
                className="h-11 min-w-0 flex-1"
              />
              <div className="relative w-24 shrink-0">
                <Input
                  value={row.pct}
                  inputMode="decimal"
                  placeholder="%"
                  onChange={(e) => setRows(rows!.map((r, j) => (j === i ? { ...r, pct: e.target.value.replace("%", "") } : r)))}
                  className="h-11 pr-7 text-right"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">%</span>
              </div>
              <button
                type="button"
                aria-label="Remove backer"
                onClick={() => setRows(rows!.filter((_, j) => j !== i))}
                className="h-11 w-9 shrink-0 text-lg text-muted active:text-foreground"
              >
                ×
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <button type="button" onClick={() => setRows([...rows!, { name: "", pct: "" }])} className="min-h-9 font-medium text-emerald-400">
              + Add backer
            </button>
            {rows!.length > 1 ? (
              <button type="button" onClick={splitEvenly} className="min-h-9 font-medium text-muted active:text-foreground">
                Split evenly
              </button>
            ) : null}
            <span className={`num ml-auto text-xs ${Math.abs(total - 100) < 0.01 ? "text-muted" : "text-amber-400"}`}>
              Total {Math.round(total * 100) / 100}%
            </span>
          </div>
          {problem && filled.length > 0 ? <p className="text-xs text-amber-400">{problem}</p> : null}
          <div className="flex gap-2">
            <Button onClick={() => save(formatBacking(filled))} disabled={saving || Boolean(problem) || filled.length === 0} className="h-10 flex-1 text-sm">
              {saving ? "Saving…" : saveLabel}
            </Button>
            {value ? (
              <Button variant="secondary" onClick={() => save("")} disabled={saving} className="h-10 text-sm">
                Unassign
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setRows(null)} disabled={saving} className="h-10 text-sm text-muted">
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
