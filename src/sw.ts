import { ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** App pages this phone has opened. Cleared on the login page (LoginForm), so one account's pages never open for another. */
const PAGES_CACHE = "app-pages";

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
  precacheOptions: { cleanupOutdatedCaches: true },
  runtimeCaching: [
    {
      matcher: ({ url }) => url.pathname === "/api/login" || url.pathname === "/api/logout",
      method: "POST",
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ request }) => request.headers.has("Next-Action") || request.headers.has("next-action"),
      method: "POST",
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ request }) => request.headers.has("RSC"),
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ url }) =>
        /^\/api\/(games|sidebets|paytables|fee-schedules|sessions|rounds|losses|evidence|audit|reimbursements|payroll-members|loans)(\/|$)/.test(
          url.pathname,
        ),
      handler: new NetworkOnly(),
    },
    {
      // Opening the app: the live page when there's signal (or within a few seconds), otherwise the copy saved
      // the last time this page was opened, so the app still opens with no signal and shows this phone's data.
      // Sign-in redirects are never saved, and the login page and API are never served from here.
      matcher: ({ request, url }) =>
        request.mode === "navigate" && url.origin === self.location.origin && !/^\/(login|api)(\/|$)/.test(url.pathname),
      handler: new NetworkFirst({
        cacheName: PAGES_CACHE,
        networkTimeoutSeconds: 4,
        matchOptions: { ignoreSearch: true },
        plugins: [
          { cacheWillUpdate: async ({ response }) => (response.status === 200 && !response.redirected ? response : null) },
          new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
      }),
    },
  ],
  // A page never opened before, with no signal: the offline page, which links to the main screens.
  fallbacks: { entries: [{ url: "/offline.html", matcher: ({ request }) => request.destination === "document" }] },
});

serwist.addEventListeners();
