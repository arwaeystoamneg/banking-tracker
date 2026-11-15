"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { AutoTrip } from "@/lib/validation/schemas";

/**
 * Which players' new sessions join a trip on their own. Shared by every screen showing it and refreshed when
 * one opens; the server applies it when a session is saved, so nothing here sits in the logging path.
 */
const EMPTY: AutoTrip[] = [];
let rows: AutoTrip[] = EMPTY;
const listeners = new Set<() => void>();
// Every trip row uses this hook; one fetch per screen is plenty.
let lastLoad = 0;

function publish(next: AutoTrip[]) {
  rows = next;
  listeners.forEach((listener) => listener());
}

async function load() {
  try {
    const res = await fetch("/api/auto-trips", { cache: "no-store" });
    if (res.ok) publish((await res.json()) as AutoTrip[]);
  } catch {
    // Offline: keep what was last loaded.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAutoTrips() {
  const autoTrips = useSyncExternalStore(subscribe, () => rows, () => EMPTY);
  useEffect(() => {
    if (Date.now() - lastLoad < 10_000) return;
    lastLoad = Date.now();
    void load();
  }, []);

  /** Ray or admin: send `player`'s new sessions into `trip`, or stop with trip = null. True when it saved. */
  const setAutoTrip = useCallback(async (player: string, playerKey: string, trip: string | null): Promise<boolean> => {
    const existing = rows.find((row) => row.player_key === playerKey);
    const res = await (trip
      ? fetch("/api/auto-trips", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ player, trip }) })
      : existing
        ? fetch(`/api/auto-trips/${encodeURIComponent(existing.player_key)}`, {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ expectedVersion: existing._row_version }),
          })
        : Promise.resolve(null)
    ).catch(() => null);
    await load();
    return trip ? Boolean(res?.ok) : !existing || Boolean(res?.ok);
  }, []);

  return { autoTrips, setAutoTrip };
}
