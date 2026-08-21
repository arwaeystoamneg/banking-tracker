import { Serwist, StaleWhileRevalidate, NetworkOnly } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Caching strategy per CLAUDE.md's offline-behavior section: the app shell is precached so the PWA
 * shell loads offline; reference-data GETs (games/sidebets/paytables/fee-schedules) get a
 * StaleWhileRevalidate cache as a secondary safety net behind the Dexie cache (offline/cache.ts) for
 * the very first offline load. Sessions/Rounds are NetworkOnly here — ALL write-queue logic lives in
 * offline/queue.ts, so a write must never be silently served from (or swallowed by) a SW cache.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url, request }) =>
        request.method === "GET" && /^\/api\/(games|sidebets|paytables|fee-schedules)(\/|$)/.test(url.pathname),
      handler: new StaleWhileRevalidate({ cacheName: "reference-data" }),
    },
    {
      matcher: ({ url }) => /^\/api\/(sessions|rounds)(\/|$)/.test(url.pathname),
      handler: new NetworkOnly(),
    },
  ],
});

serwist.addEventListeners();
