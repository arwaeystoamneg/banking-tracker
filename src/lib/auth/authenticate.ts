import "server-only";

import {
  checkPassphrase,
  makeAuthToken,
  makeCredentialVersion,
} from "@/lib/auth/passphrase";
import { authenticateAccount } from "@/lib/auth/accounts";
import { AuthConfigError, type AuthUser } from "@/lib/auth/types";
import { canAttemptLogin, clearLoginFailures, recordLoginFailure } from "@/lib/auth/rateLimit";
import { LOGIN_ERROR, type LoginErrorCode } from "@/lib/auth/loginErrors";

export { LOGIN_ERROR, LOGIN_ERROR_MESSAGES, isLoginErrorCode, safeLoginDestination } from "@/lib/auth/loginErrors";
export type { LoginErrorCode } from "@/lib/auth/loginErrors";

async function isAdminPassphrase(passphrase: string): Promise<boolean> {
  try {
    return Boolean(passphrase) && (await checkPassphrase(passphrase));
  } catch (error) {
    if (error instanceof Error && /APP_PASSPHRASE is not set/.test(error.message)) return false;
    throw error;
  }
}

export async function authenticateLogin(input: {
  mode: string;
  username: string;
  passphrase: string;
  attemptKey: string;
}): Promise<{ user: AuthUser; token: string } | { error: LoginErrorCode }> {
  const username = input.username.trim();
  const isDemo = input.mode === "demo" || username.toLowerCase() === "demo";

  if (!isDemo && !canAttemptLogin(input.attemptKey)) {
    return { error: LOGIN_ERROR.rateLimit };
  }

  try {
    let user: AuthUser | null = null;
    if (isDemo) {
      user = { role: "demo", userId: "demo", name: "Demo" };
    } else if ((!username || username.toLowerCase() === "admin") && (await isAdminPassphrase(input.passphrase))) {
      user = {
        role: "admin",
        userId: "admin",
        name: "Admin",
        accountVersion: await makeCredentialVersion(input.passphrase),
      };
    } else if (username && input.passphrase) {
      user = await authenticateAccount(username, input.passphrase);
    }

    if (!user) {
      recordLoginFailure(input.attemptKey);
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { error: LOGIN_ERROR.credentials };
    }

    const token = await makeAuthToken(user);
    clearLoginFailures(input.attemptKey);
    return { user, token };
  } catch (error) {
    if (error instanceof AuthConfigError) return { error: LOGIN_ERROR.config };
    if (
      error instanceof Error &&
      /AUTH_COOKIE_SECRET|APP_PASSPHRASE is not set|APP_USERS_JSON|APP_USERS_FILE/.test(error.message)
    ) {
      return { error: LOGIN_ERROR.config };
    }
    throw error;
  }
}
