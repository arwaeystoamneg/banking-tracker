import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth/passphrase";

export async function proxy(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (await verifyAuthToken(token)) {
      return NextResponse.next();
    }
  } catch {
    // A missing AUTH_COOKIE_SECRET must not 500 every page; send the user to sign in instead.
  }

  // An API call gets a plain 401, never a redirect: fetch follows redirects, so an expired sign-in would get the
  // login page back as "200 OK" and the offline queue would count a queued delete as done.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match everything except:
     * - /login (the login page itself)
     * - /api/login and /api/logout (unauthenticated form posts)
     * - Next internals and static assets
     * - PWA files that must be reachable pre-auth for install/offline shell to work
     */
    "/((?!login|api/login|api/logout|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline\\.html|icons/).*)",
  ],
};
