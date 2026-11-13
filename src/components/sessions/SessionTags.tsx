"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Chip } from "@/components/ui/Chip";
import { useSessions } from "@/hooks/useSessions";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { canMarkPayrollPaid } from "@/lib/payroll";
import { canonicalCasino, normalizeCasinoKey, TAG_CARDROOM_AREAS, TAG_CARDROOMS } from "@/lib/names";
import type { Session } from "@/lib/validation/schemas";

/** The session's cardroom and "Ray sponsored only", shown as tags next to it. */
export function SessionTagBadges({ session }: { session: Pick<Session, "casino" | "ray_sponsored"> }) {
  return (
    <>
      {session.casino ? <Badge tone="room">{canonicalCasino(session.casino)}</Badge> : null}
      {session.ray_sponsored ? <Badge tone="sponsor">Ray sponsored only</Badge> : null}
    </>
  );
}

/** Ray or admin marks which cardroom a session was at, and whether it was Ray sponsored only. */
export function SessionTagEditor({ session }: { session: Session }) {
  const user = useCurrentUser();
  const { update } = useSessions();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!canMarkPayrollPaid(user)) return null;
  const roomKey = normalizeCasinoKey(session.casino);
  const otherRoom = session.casino && !TAG_CARDROOMS.some((room) => normalizeCasinoKey(room) === roomKey) ? canonicalCasino(session.casino) : "";

  async function save(patch: Partial<Pick<Session, "casino" | "ray_sponsored">>) {
    setSaving(true);
    setError("");
    try {
      await update(session.session_id, patch, session._row_version);
    } catch {
      setError("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
      <div>
        <p className="font-medium text-foreground">Cardroom</p>
        <p className="text-xs text-muted">Tap again to clear{otherRoom ? ` · now ${otherRoom}` : ""}</p>
      </div>
      <fieldset className="space-y-2" disabled={saving}>
        {TAG_CARDROOM_AREAS.map(({ area, rooms }) => (
          <div key={area} className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{area}</p>
            <div className="flex flex-wrap gap-2">
              {rooms.map((room) => {
                const active = normalizeCasinoKey(room) === roomKey;
                return (
                  <Chip key={room} active={active} onClick={() => save({ casino: active ? "" : room })}>
                    {room}
                  </Chip>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>
      <label className="flex min-h-12 items-center justify-between gap-3 border-t border-border pt-3">
        <span>
          <span className="font-medium text-foreground">Ray sponsored only</span>
          <span className="block text-xs text-muted">Shows a tag next to this session</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={session.ray_sponsored}
          onChange={() => save({ ray_sponsored: !session.ray_sponsored })}
          disabled={saving}
          className="h-6 w-6 accent-violet-500"
        />
      </label>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </section>
  );
}
