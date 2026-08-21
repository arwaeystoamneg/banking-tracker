import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  // Building a service worker during `next dev` races Next's own manifest writes and can leave the
  // dev server returning "Manifest file is empty". Offline support is a production concern.
  disable: process.env.NODE_ENV !== "production",
  // Registration is handled explicitly so development can remove stale workers from localhost.
  register: false,
  reloadOnOnline: true,
  additionalPrecacheEntries: [{ url: "/offline.html", revision: "1" }],
});

const nextConfig: NextConfig = {
  // googleapis uses Node crypto/TLS; bundling it for serverless often breaks JWT auth on Vercel.
  serverExternalPackages: ["googleapis", "google-auth-library"],
};

export default withSerwist(nextConfig);
