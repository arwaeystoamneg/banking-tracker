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
