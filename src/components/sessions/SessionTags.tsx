"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Chip } from "@/components/ui/Chip";
import { TripPicker } from "@/components/sessions/TripPicker";
import { useSessions } from "@/hooks/useSessions";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { canMarkPayrollPaid } from "@/lib/payroll";
import { sessionCardroom, sessionCardrooms, TAG_CARDROOM_AREAS, TAG_CARDROOMS } from "@/lib/names";
import { roomBadgeStyle, roomDotStyle } from "@/lib/cardroomColors";
import { useRoomColors } from "@/hooks/useRoomColors";
import { sessionTrip, tripNames } from "@/lib/trips";
import type { Session } from "@/lib/validation/schemas";

type Marks = Partial<Pick<Session, "casino" | "ray_sponsored" | "trip">>;

/** The session's cardroom and "Ray sponsored only", shown as tags next to it. */
export function SessionTagBadges({ session }: { session: Pick<Session, "casino" | "ray_sponsored"> }) {
  const { colorOf } = useRoomColors();
  return (
    <>
      {sessionCardrooms(session.casino).map((room) => (
        <Badge key={room} className="font-semibold" style={roomBadgeStyle(colorOf(room))}>
          {room}
        </Badge>
      ))}
      {session.ray_sponsored ? <Badge tone="sponsor">Ray sponsored only</Badge> : null}
    </>
  );
}

/** One-tap cardroom buttons by area; tapping the current room clears it. */
export function CardroomPicker({ current, onPick, disabled = false }: { current: string; onPick: (room: string) => void; disabled?: boolean }) {
  const { colorOf } = useRoomColors();
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      {TAG_CARDROOM_AREAS.map(({ area, rooms }) => (
        <div key={area} className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{area}</p>
          <div className="flex flex-wrap gap-2">
            {rooms.map((room) => {
              const active = room === current;
              return (
                <Chip key={room} active={active} onClick={() => onPick(active ? "" : room)}>
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={roomDotStyle(colorOf(room))} />
                    {room}
                  </span>
                </Chip>
              );
            })}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

/** Ray or admin picks each room's color; everyone sees the change. */
export function RoomColorEditor() {
  const { colorOf, setColor } = useRoomColors();
  const [error, setError] = useState("");
  return (
    <div className="space-y-2">
      {TAG_CARDROOM_AREAS.map(({ area, rooms }) => (
        <div key={area} className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{area}</p>
          <div className="grid grid-cols-2 gap-2">
            {rooms.map((room) => (
              <label key={room} className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-inset px-3">
                <input
                  type="color"
                  value={colorOf(room)}
                  onChange={(e) => {
                    setError("");
                    setColor(room, e.target.value, () => setError(`Couldn't save ${room}'s color.`));
                  }}
                  className="h-7 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                  aria-label={`${room} color`}
                />
                <span className="truncate text-sm text-foreground">{room}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

/** Ray or admin marks a session's cardroom, its trip, and whether it was Ray sponsored only. */
export function SessionTagEditor({ session }: { session: Session }) {
  const user = useCurrentUser();
  const { sessions, update } = useSessions();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingColors, setEditingColors] = useState(false);
  const names = useMemo(() => tripNames(sessions), [sessions]);
  if (!canMarkPayrollPaid(user)) return null;
  const current = sessionCardroom(session.casino);
  const otherRoom = current && !TAG_CARDROOMS.includes(current) ? current : "";

  async function save(patch: Marks) {
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">Cardroom</p>
          <p className="text-xs text-muted">Tap again to clear{otherRoom ? ` · now ${otherRoom}` : ""}</p>
        </div>
        <button type="button" onClick={() => setEditingColors((v) => !v)} className="min-h-9 text-xs font-medium text-muted underline active:text-foreground">
          {editingColors ? "Done with colors" : "Room colors"}
        </button>
      </div>
      {editingColors ? <RoomColorEditor /> : <CardroomPicker current={current} onPick={(room) => save({ casino: room })} disabled={saving} />}
      <div className="space-y-2 border-t border-border pt-3">
        <div>
          <p className="font-medium text-foreground">Trip</p>
          <p className="text-xs text-muted">Sessions you put in the same trip are grouped under Trips</p>
        </div>
        <TripPicker current={sessionTrip(session)} names={names} onPick={(trip) => save({ trip })} disabled={saving} />
      </div>
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
