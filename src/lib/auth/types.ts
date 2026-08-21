export type AuthRole = "admin" | "individual" | "demo";

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

export function isPrivilegedUser(user: AuthUser): boolean {
  return user.role === "admin" || user.role === "individual";
}
