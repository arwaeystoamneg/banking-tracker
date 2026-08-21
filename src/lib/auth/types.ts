export type AuthRole = "admin" | "individual" | "employee" | "demo";

/** Roles that come from APP_USERS_JSON rather than the shared passphrase or the demo login. */
export const CONFIGURED_ACCOUNT_ROLES = ["individual", "employee"] as const;
export type ConfiguredAccountRole = (typeof CONFIGURED_ACCOUNT_ROLES)[number];

export function isConfiguredAccountRole(role: AuthRole): role is ConfiguredAccountRole {
  return role === "individual" || role === "employee";
}

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

export interface AuthUser {
  role: AuthRole;
  userId: string;
  name: string;
  /** Opaque HMAC used server-side to revoke sessions when a credential changes. */
  accountVersion?: string;
}

/**
 * Privileged = can see and write the banking dataset (games, sessions, EV). Demo is the only
 * role that is not. Review of loss reports stays admin-only.
 */
export function isPrivilegedUser(user: AuthUser): boolean {
  return user.role === "admin" || isConfiguredAccountRole(user.role);
}
