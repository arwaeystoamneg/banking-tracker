import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from "@/lib/auth/passphrase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.nextUrl.origin), 303);
  response.cookies.set(AUTH_COOKIE_NAME, "", { ...AUTH_COOKIE_OPTIONS, maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
