import { Serwist, NetworkOnly } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Caching strategy per CLAUDE.md's offline-behavior section: the app shell is precached so the PWA
 * shell loads offline. Authenticated API responses are NetworkOnly so the service worker cannot leak
 * a live account's cached response into the public demo (or vice versa). Role-partitioned Dexie stores
 * provide offline data, and ALL write-queue logic remains in offline/queue.ts.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  navigateFallback: "/offline.html",
  runtimeCaching: [
    {
      matcher: ({ url }) =>
        /^\/api\/(games|sidebets|paytables|fee-schedules|sessions|rounds)(\/|$)/.test(url.pathname),
      handler: new NetworkOnly(),
    },
  ],
});

serwist.addEventListeners();
