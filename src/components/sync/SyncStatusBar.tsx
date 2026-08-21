"use client";

import { useState } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { flushQueue } from "@/offline/queue";
import { ConflictDialog } from "@/components/sync/ConflictDialog";

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return `${hours}h ago`;
}

export function SyncStatusBar() {
  const online = useOnlineStatus();
  const { pendingCount, conflictCount, lastSyncedAt } = useSyncStatus();
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const hasWork = pendingCount > 0 || conflictCount > 0 || !online;

  return (
    <>
      <div
        className={`flex items-center justify-between gap-2 border-b border-border px-4 py-1.5 text-xs ${
          hasWork ? "bg-amber-500/10 text-amber-300" : "bg-surface text-muted"
        }`}
      >
        <span>
          {!online ? "Offline. " : ""}
          {pendingCount > 0 ? `${pendingCount} pending write${pendingCount === 1 ? "" : "s"}. ` : "All synced. "}
          Last synced: {relativeTime(lastSyncedAt)}
        </span>
        <div className="flex items-center gap-3">
          {conflictCount > 0 ? (
            <button onClick={() => setConflictsOpen(true)} className="font-semibold text-red-400 underline">
              {conflictCount} conflict{conflictCount === 1 ? "" : "s"}
            </button>
          ) : null}
          <button
            onClick={async () => {
              setSyncing(true);
              await flushQueue();
              setSyncing(false);
            }}
            disabled={syncing || !online}
            className="font-medium text-emerald-400 disabled:opacity-40"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
      </div>
      <ConflictDialog open={conflictsOpen} onClose={() => setConflictsOpen(false)} />
    </>
  );
}
