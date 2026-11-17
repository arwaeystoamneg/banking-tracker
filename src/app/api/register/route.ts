import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from "@/lib/auth/passphrase";
import { registerAndLogin } from "@/lib/auth/authenticate";

export const dynamic = "force-dynamic";

/** The register form on /login posts here. A new account is signed in straight away, waiting for approval. */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const result = await registerAndLogin({
    username: String(formData.get("username") ?? ""),
    name: String(formData.get("name") ?? ""),
    password: String(formData.get("passphrase") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
    attemptKey: `${address}:register`,
  });

  if ("error" in result) {
    const url = new URL("/login", request.nextUrl.origin);
    url.searchParams.set("mode", "register");
    url.searchParams.set("error", result.error);
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const response = NextResponse.redirect(new URL("/", request.nextUrl.origin), 303);
  response.cookies.set(AUTH_COOKIE_NAME, result.token, AUTH_COOKIE_OPTIONS);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
