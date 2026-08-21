"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS, checkPassphrase, makeAuthToken } from "@/lib/auth/passphrase";

export async function login(formData: FormData): Promise<{ error?: string }> {
  const passphrase = String(formData.get("passphrase") ?? "");
  const from = String(formData.get("from") ?? "/");

  if (!passphrase || !(await checkPassphrase(passphrase))) {
    return { error: "Wrong passphrase." };
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, await makeAuthToken(), AUTH_COOKIE_OPTIONS);

  redirect(from.startsWith("/") ? from : "/");
}
