"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { roomHex } from "@/lib/cardroomColors";

/**
 * The room colors Ray or admin picked, shared by everyone. Loaded once per app open and kept on the phone,
 * so tags still show the right colors offline; until they load, the defaults show.
 */
const STORAGE_KEY = "room-colors";
const EMPTY: Record<string, string> = {};
let chosen: Record<string, string> | null = null;
let requested = false;
const listeners = new Set<() => void>();
const pending: Record<string, ReturnType<typeof setTimeout>> = {};
const lastSaved: Record<string, string> = {};

function readSaved(): Record<string, string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as Record<string, string>) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function publish(next: Record<string, string>) {
  chosen = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A private window can refuse storage; the colors still apply for this visit.
  }
  listeners.forEach((listener) => listener());
}

async function load() {
  try {
    const res = await fetch("/api/room-colors", { cache: "no-store" });
    if (!res.ok) return;
    const rows = (await res.json()) as { room: string; color: string }[];
    publish(Object.fromEntries(rows.filter((row) => row.room && row.color).map((row) => [row.room, row.color])));
  } catch {
    // Offline: keep what this phone last saw.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): Record<string, string> {
  if (chosen === null) chosen = readSaved();
  return chosen;
}

export function useRoomColors() {
  const colors = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  useEffect(() => {
    if (requested) return;
    requested = true;
    void load();
  }, []);

  const colorOf = useCallback((room: string) => roomHex(room, colors), [colors]);

  /**
   * Ray or admin sets a room's color for everyone. It shows at once; the save waits until the color stops
   * changing (dragging in a color picker reports every step), and a failed save puts the old color back.
   */
  const setColor = useCallback((room: string, color: string, onError?: () => void) => {
    const saved = lastSaved[room] ?? roomHex(room, snapshot());
    publish({ ...snapshot(), [room]: color });
    clearTimeout(pending[room]);
    pending[room] = setTimeout(async () => {
      const res = await fetch("/api/room-colors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ room, color }),
      }).catch(() => null);
      if (res?.ok) {
        lastSaved[room] = color;
        return;
      }
      publish({ ...snapshot(), [room]: saved });
      onError?.();
    }, 600);
  }, []);

  return { colorOf, setColor };
}
