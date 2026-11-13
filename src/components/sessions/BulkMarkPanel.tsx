"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CardroomPicker } from "@/components/sessions/SessionTags";
import { TripPicker } from "@/components/sessions/TripPicker";
import { useSessions } from "@/hooks/useSessions";
import type { Session } from "@/lib/validation/schemas";

type Action = "trip" | "cardroom" | null;

/** Puts every selected session in a trip, or tags them all with a cardroom, in one go. */
export function BulkMarkPanel({
  selected,
  tripNames,
  onClear,
  onDone,
}: {
  selected: Session[];
  tripNames: string[];
  onClear: () => void;
  onDone: () => void;
}) {
  const { update } = useSessions();
  const [action, setAction] = useState<Action>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function apply(patch: Partial<Pick<Session, "casino" | "trip">>, label: string) {
    setSaving(true);
    setMessage("");
    let failed = 0;
    for (const session of selected) {
      try {
        await update(session.session_id, patch, session._row_version);
      } catch {
        failed += 1;
      }
    }
    setSaving(false);
    setAction(null);
    const done = selected.length - failed;
    setMessage(`${label} on ${done} session${done === 1 ? "" : "s"}${failed ? `; ${failed} couldn't be saved` : ""}.`);
    if (!failed) onClear();
  }

  const count = selected.length;
  return (
    <section className="sticky top-2 z-10 space-y-3 rounded-2xl border border-emerald-500/40 bg-surface p-3 text-sm shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-foreground">
          {count === 0 ? "Tap sessions to select them" : `${count} selected`}
        </p>
        <div className="flex gap-2">
          {count > 0 ? (
            <button type="button" onClick={onClear} className="min-h-9 px-2 text-xs text-muted active:text-foreground">
              Clear
            </button>
          ) : null}
          <button type="button" onClick={onDone} className="min-h-9 px-2 text-xs font-semibold text-emerald-400">
            Done
          </button>
        </div>
      </div>
      {count > 0 ? (
        <div className="flex gap-2">
          <Button
            variant={action === "trip" ? "primary" : "secondary"}
            className="h-10 flex-1 text-xs"
            onClick={() => setAction(action === "trip" ? null : "trip")}
            disabled={saving}
          >
            Put in trip
          </Button>
          <Button
            variant={action === "cardroom" ? "primary" : "secondary"}
            className="h-10 flex-1 text-xs"
            onClick={() => setAction(action === "cardroom" ? null : "cardroom")}
            disabled={saving}
          >
            Set cardroom
          </Button>
        </div>
      ) : null}
      {count > 0 && action === "trip" ? (
        <div className="space-y-2">
          <TripPicker current="" names={tripNames} onPick={(trip) => trip && apply({ trip }, `Put in ${trip}`)} disabled={saving} />
          <button
            type="button"
            onClick={() => apply({ trip: "" }, "Taken out of their trip")}
            disabled={saving}
            className="text-xs text-muted underline active:text-foreground"
          >
            Take out of any trip
          </button>
        </div>
      ) : null}
      {count > 0 && action === "cardroom" ? (
        <div className="space-y-2">
          <CardroomPicker current="" onPick={(room) => room && apply({ casino: room }, `Tagged ${room}`)} disabled={saving} />
          <button
            type="button"
            onClick={() => apply({ casino: "" }, "Cardroom cleared")}
            disabled={saving}
            className="text-xs text-muted underline active:text-foreground"
          >
            Clear cardroom
          </button>
        </div>
      ) : null}
      {saving ? <p className="text-xs text-muted">Saving…</p> : message ? <p className="text-xs text-emerald-400">{message}</p> : null}
    </section>
  );
}
