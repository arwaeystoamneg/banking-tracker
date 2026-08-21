"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // A production worker previously installed on localhost keeps controlling development pages
      // even after the Serwist webpack plugin is disabled. Remove it to prevent stale app/API data.
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        void Promise.all(registrations.map((registration) => registration.unregister()));
      });
      return;
    }

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.error("Service worker registration failed", err);
    });
  }, []);

  return null;
}
