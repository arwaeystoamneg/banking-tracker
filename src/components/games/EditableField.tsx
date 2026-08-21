"use client";

import { useState } from "react";

interface EditableFieldProps {
  label: string;
  value: string;
  multiline?: boolean;
  readOnly?: boolean;
  onSave: (newValue: string) => void | Promise<void>;
}

/**
 * Click-to-edit in place, per CLAUDE.md feature 2. Saving always goes through the offline write
 * queue (see useRepoMutations/useGames), so this component doesn't need to handle a conflict response
 * itself — conflicts surface globally via SyncStatusBar/ConflictDialog once the queue tries to flush.
 */
export function EditableField({ label, value, multiline, readOnly = false, onSave }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  async function commit() {
    setEditing(false);
    if (draft !== value) {
      await onSave(draft);
    }
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium uppercase tracking-wide text-muted">{label}</label>
      {editing ? (
        multiline ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            rows={3}
            className="w-full rounded-xl border border-neutral-500 bg-surface px-3 py-2 text-base text-foreground outline-none"
          />
        ) : (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="h-11 w-full rounded-xl border border-neutral-500 bg-surface px-3 text-base text-foreground outline-none"
          />
        )
      ) : (
        <button
          disabled={readOnly}
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          className="min-h-11 w-full rounded-xl border border-transparent px-3 py-2 text-left text-base text-foreground enabled:active:border-border enabled:active:bg-surface"
        >
          {value || <span className="text-muted">{readOnly ? "—" : "Tap to add…"}</span>}
        </button>
      )}
    </div>
  );
}
