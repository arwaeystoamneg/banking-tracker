import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from "@/lib/auth/passphrase";
import { authenticateLogin } from "@/lib/auth/authenticate";
import { safeLoginDestination } from "@/lib/auth/loginErrors";

export const dynamic = "force-dynamic";

function loginErrorRedirect(request: NextRequest, from: string, error: string): NextResponse {
  const url = new URL("/login", request.nextUrl.origin);
  url.searchParams.set("error", error);
  if (from && from !== "/") url.searchParams.set("from", from);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const from = safeLoginDestination(String(formData.get("from") ?? "/"));
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const username = String(formData.get("username") ?? "").trim();

  const result = await authenticateLogin({
    mode: String(formData.get("mode") ?? "account"),
    username,
    passphrase: String(formData.get("passphrase") ?? ""),
    attemptKey: `${address}:${username.toLowerCase() || "admin"}`,
  });

  if ("error" in result) {
    return loginErrorRedirect(request, from, result.error);
  }

  const destination = new URL(from, request.nextUrl.origin);
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(AUTH_COOKIE_NAME, result.token, AUTH_COOKIE_OPTIONS);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.nextUrl.origin), 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
