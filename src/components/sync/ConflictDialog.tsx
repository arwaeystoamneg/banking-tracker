"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { db } from "@/offline/db";
import { resolveConflict } from "@/offline/queue";

export function ConflictDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const conflicts =
    useLiveQuery(() => (db ? db.writeQueue.where("status").anyOf("conflict", "blocked").toArray() : []), []) ?? [];

  return (
    <Dialog open={open} onClose={onClose} title="Sync conflicts">
      {conflicts.length === 0 ? (
        <p className="text-sm text-muted">No conflicts.</p>
      ) : (
        <div className="space-y-4">
          {conflicts.map((c) => (
            <div key={c.id} className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
              <p className="text-sm font-medium text-foreground">
                {c.tab} / {c.targetId}
              </p>
              <p className="mt-1 text-xs text-muted">
                {c.status === "conflict"
                  ? "This row changed on the server since you last loaded it. Your edit was NOT saved."
                  : "The server permanently rejected this write. Discard it after reviewing the error below."}
              </p>
              {c.lastError ? (
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-black/40 p-2 text-[11px] text-muted">{c.lastError}</pre>
              ) : null}
              <div className="mt-3 flex gap-2">
                <Button
                  variant="secondary"
                  className="h-9 flex-1 text-xs"
                  onClick={() => c.id !== undefined && resolveConflict(c.id, "discard-mine")}
                >
                  Discard my edit
                </Button>
                {c.status === "conflict" ? (
                  <Button
                    variant="primary"
                    className="h-9 flex-1 text-xs"
                    onClick={() => c.id !== undefined && resolveConflict(c.id, "keep-mine")}
                  >
                    Retry my edit
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
