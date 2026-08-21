import "server-only";

import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, checkSecret, makeCredentialVersion, verifyAuthToken } from "@/lib/auth/passphrase";
import type { AuthUser } from "@/lib/auth/types";
import { isCurrentIndividualSession } from "@/lib/auth/accounts";

export class AuthenticationError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const user = await verifyAuthToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  if (!user) return null;

  if (user.role === "individual" && !(await isCurrentIndividualSession(user))) return null;
  if (user.role === "admin") {
    const passphrase = process.env.APP_PASSPHRASE;
    if (
      !passphrase ||
      !user.accountVersion ||
      !(await checkSecret(user.accountVersion, await makeCredentialVersion(passphrase)))
    ) {
      return null;
    }
  }

  return { role: user.role, userId: user.userId, name: user.name };
}

export async function requireCurrentUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthenticationError();
  return user;
}
