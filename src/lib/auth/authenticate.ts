import "server-only";

import {
  checkPassphrase,
  makeAuthToken,
  makeCredentialVersion,
} from "@/lib/auth/passphrase";
import {
  authenticateAccount,
  authenticateRegisteredAccount,
  registeredTokenUser,
  reservedIdentities,
} from "@/lib/auth/accounts";
import { createRegisteredAccount, RegistrationError } from "@/lib/auth/registered";
import { AuthConfigError, type AuthUser } from "@/lib/auth/types";
import {
  MAX_FAILURES_PER_ADDRESS,
  MAX_SIGNUPS_PER_ADDRESS,
  canAttemptLogin,
  clearLoginFailures,
  recordLoginFailure,
} from "@/lib/auth/rateLimit";
import { MAX_PASSWORD_LENGTH } from "@/lib/auth/password";
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
  /** The caller's address alone, limited across every username it tries. */
  addressKey?: string;
}): Promise<{ user: AuthUser; token: string } | { error: LoginErrorCode }> {
  const username = input.username.trim();
  const isDemo = input.mode === "demo" || username.toLowerCase() === "demo";
  const addressKey = input.addressKey ? `${input.addressKey}:any` : null;

  if (
    !isDemo &&
    (!canAttemptLogin(input.attemptKey) || (addressKey && !canAttemptLogin(addressKey, MAX_FAILURES_PER_ADDRESS)))
  ) {
    return { error: LOGIN_ERROR.rateLimit };
  }
  // Count the attempt before the (slow) password check, so a burst of parallel guesses can't all slip in
  // ahead of the first failure being recorded. A successful login clears the per-username count.
  if (!isDemo) {
    recordLoginFailure(input.attemptKey);
    if (addressKey) recordLoginFailure(addressKey);
  }
  if (username.length > 64 || input.passphrase.length > MAX_PASSWORD_LENGTH) {
    return { error: LOGIN_ERROR.credentials };
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
      if (!user) {
        const registered = await authenticateRegisteredAccount(username, input.passphrase);
        if (registered === "declined") return { error: LOGIN_ERROR.declined };
        user = registered;
      }
    }

    if (!user) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { error: LOGIN_ERROR.credentials };
    }

    const token = await makeAuthToken(user.registered ? registeredTokenUser(user) : user);
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

/**
 * Creates a pending account from the register form and signs it in. It sees the public demo until Ray or
 * admin approves it. Rate-limited per address like sign-in, so nobody can fill the sheet with sign-ups.
 */
export async function registerAndLogin(input: {
  username: string;
  name: string;
  password: string;
  confirm: string;
  attemptKey: string;
}): Promise<{ user: AuthUser; token: string } | { error: LoginErrorCode }> {
  if (!canAttemptLogin(input.attemptKey, MAX_SIGNUPS_PER_ADDRESS)) return { error: LOGIN_ERROR.rateLimit };
  // Every sign-up counts, successful or not: there's no reason one address makes many accounts.
  recordLoginFailure(input.attemptKey);
  if (input.password !== input.confirm) return { error: LOGIN_ERROR.mismatch };
  if (input.password.length > MAX_PASSWORD_LENGTH) return { error: LOGIN_ERROR.invalidSignup };

  try {
    const account = await createRegisteredAccount(
      { username: input.username, name: input.name, password: input.password },
      reservedIdentities(),
    );
    const user: AuthUser = {
      role: "demo",
      userId: `pending_${account.account_id}`,
      name: account.name,
      accountVersion: await makeCredentialVersion(account.password_hash),
      registered: true,
      pending: true,
    };
    return { user, token: await makeAuthToken(registeredTokenUser(user)) };
  } catch (error) {
    if (error instanceof RegistrationError) {
      return {
        error: error.code === "taken" ? LOGIN_ERROR.taken : error.code === "full" ? LOGIN_ERROR.signupsFull : LOGIN_ERROR.invalidSignup,
      };
    }
    if (error instanceof AuthConfigError) return { error: LOGIN_ERROR.config };
    if (error instanceof Error && /AUTH_COOKIE_SECRET|APP_PASSPHRASE is not set/.test(error.message)) {
      return { error: LOGIN_ERROR.config };
    }
    throw error;
  }
}
