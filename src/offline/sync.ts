import { flushQueue } from "@/offline/queue";

const FOREGROUND_FLUSH_INTERVAL_MS = 60_000;

/**
 * Drives the write-queue flush from foreground app JS on: initial mount, `online` events, and a 60s
 * interval. Deliberately NOT using the Service Worker Background Sync API — iOS Safari doesn't
 * support it, and this is a phone PWA, so background sync would silently never fire there.
 */
export function startSyncLoop(): () => void {
  void flushQueue();

  const onOnline = () => void flushQueue();
  window.addEventListener("online", onOnline);

  const interval = setInterval(() => void flushQueue(), FOREGROUND_FLUSH_INTERVAL_MS);

  return () => {
    window.removeEventListener("online", onOnline);
    clearInterval(interval);
  };
}
