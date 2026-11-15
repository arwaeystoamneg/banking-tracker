"use client";

import { useMemo, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { useCurrentUser, useTeam } from "@/components/providers/AuthProvider";
import { useAutoTrips } from "@/hooks/useAutoTrips";
import { canMarkPayrollPaid } from "@/lib/payroll";
import { canonicalPerson, normalizePersonKey } from "@/lib/names";

function keyOf(name: string): string {
  return normalizePersonKey(canonicalPerson(name));
}

/**
 * On a trip's page: who it auto-adds new sessions for. Everyone sees it; Ray or admin taps a player to turn it
 * on (moving them off any other trip) or off.
 */
export function AutoTripControl({ trip, players }: { trip: string; players: string[] }) {
  const user = useCurrentUser();
  const team = useTeam();
  const { autoTrips, setAutoTrip } = useAutoTrips();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const canEdit = canMarkPayrollPaid(user);

  const people = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const name of [...players, ...team.map((member) => member.name)]) {
      const key = keyOf(name);
      if (key && !byKey.has(key)) byKey.set(key, canonicalPerson(name));
    }
    return [...byKey.entries()].map(([key, name]) => ({ key, name }));
  }, [players, team]);

  const here = autoTrips.filter((row) => row.trip.toLowerCase() === trip.toLowerCase());
  if (!canEdit && here.length === 0) return null;

  async function toggle(key: string, name: string, on: boolean) {
    if (busy) return;
    setBusy(key);
    setError("");
    const ok = await setAutoTrip(name, key, on ? trip : null);
    if (!ok) setError("Couldn't save that. Check your connection and try again.");
    setBusy("");
  }

  return (
    <section className="space-y-2 rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Auto-add new sessions</p>
      <p className="text-xs text-muted">
        {here.length
          ? `New sessions for ${here.map((row) => row.player).join(" and ")} join this trip on their own.`
          : "Off. Tap a player and their new sessions join this trip until you turn it off."}
      </p>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          {people.map(({ key, name }) => {
            const current = autoTrips.find((row) => row.player_key === key);
            const on = current?.trip.toLowerCase() === trip.toLowerCase();
            return (
              <Chip key={key} active={on} onClick={() => toggle(key, name, !on)}>
                {busy === key ? "Saving…" : name}
                {!on && current?.trip ? <span className="text-muted"> · in {current.trip}</span> : null}
              </Chip>
            );
          })}
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </section>
  );
}
