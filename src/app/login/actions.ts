"use server";

import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_OPTIONS,
  checkPassphrase,
  makeAuthToken,
  makeCredentialVersion,
} from "@/lib/auth/passphrase";
import { authenticateIndividual } from "@/lib/auth/accounts";
import type { AuthUser } from "@/lib/auth/types";
import { canAttemptLogin, clearLoginFailures, recordLoginFailure } from "@/lib/auth/rateLimit";

export async function login(formData: FormData): Promise<{ error?: string }> {
  const mode = String(formData.get("mode") ?? "account");
  const username = String(formData.get("username") ?? "").trim();
  const passphrase = String(formData.get("passphrase") ?? "");
  const from = String(formData.get("from") ?? "/");
  const isDemo = mode === "demo" || username.toLowerCase() === "demo";
  const requestHeaders = await headers();
  const address = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const attemptKey = `${address}:${username.toLowerCase() || "admin"}`;

  if (!isDemo && !canAttemptLogin(attemptKey)) {
    return { error: "Too many failed attempts. Try again later." };
  }

  let user: AuthUser | null = null;
  if (isDemo) {
    user = { role: "demo", userId: "demo", name: "Demo" };
  } else if ((!username || username.toLowerCase() === "admin") && passphrase && (await checkPassphrase(passphrase))) {
    user = {
      role: "admin",
      userId: "admin",
      name: "Admin",
      accountVersion: await makeCredentialVersion(passphrase),
    };
  } else if (username && passphrase) {
    user = await authenticateIndividual(username, passphrase);
  }

  if (!user) {
    recordLoginFailure(attemptKey);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { error: "Wrong username or password." };
  }
  clearLoginFailures(attemptKey);

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, await makeAuthToken(user), AUTH_COOKIE_OPTIONS);
  const safeDestination = from.startsWith("/") && !from.startsWith("//") && !from.includes("\\") ? from : "/";
  redirect(safeDestination);
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
  redirect("/login");
}
