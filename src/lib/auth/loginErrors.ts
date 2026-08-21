export const LOGIN_ERROR = {
  credentials: "credentials",
  rateLimit: "rate_limit",
  config: "config",
} as const;

export type LoginErrorCode = (typeof LOGIN_ERROR)[keyof typeof LOGIN_ERROR];

export const LOGIN_ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  credentials: "Wrong username or password.",
  rate_limit: "Too many failed attempts. Try again later.",
  config: "Sign-in isn't configured on this server.",
};

export function isLoginErrorCode(value: string | null): value is LoginErrorCode {
  return value === LOGIN_ERROR.credentials || value === LOGIN_ERROR.rateLimit || value === LOGIN_ERROR.config;
}

export function safeLoginDestination(from: string): string {
  if (!from.startsWith("/") || from.startsWith("//") || from.includes("\\")) return "/";
  if (from === "/login" || from.startsWith("/login?") || from.startsWith("/api/")) return "/";
  return from;
}
