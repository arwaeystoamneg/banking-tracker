export const LOGIN_ERROR = {
  credentials: "credentials",
  rateLimit: "rate_limit",
  config: "config",
  declined: "declined",
  taken: "taken",
  invalidSignup: "invalid_signup",
  mismatch: "mismatch",
  signupsFull: "signups_full",
} as const;

export type LoginErrorCode = (typeof LOGIN_ERROR)[keyof typeof LOGIN_ERROR];

export const LOGIN_ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  credentials: "Wrong username or password.",
  rate_limit: "Too many failed attempts. Try again later.",
  config: "Sign-in isn't configured on this server.",
  declined: "This account wasn't approved. Ask Ray if you think that's a mistake.",
  taken: "That username or name is already taken.",
  invalid_signup: "Use a 3–32 character username (letters, numbers, - or _), your name, and a password of 8–256 characters.",
  mismatch: "The two passwords don't match.",
  signups_full: "Too many sign-ups are waiting for approval. Ask Ray to clear them, then try again.",
};

export function isLoginErrorCode(value: string | null): value is LoginErrorCode {
  return Object.values(LOGIN_ERROR).includes(value as LoginErrorCode);
}

export function safeLoginDestination(from: string): string {
  if (!from.startsWith("/") || from.startsWith("//") || from.includes("\\")) return "/";
  if (from === "/login" || from.startsWith("/login?") || from.startsWith("/api/")) return "/";
  if (from === "/register" || from.startsWith("/register?")) return "/";
  return from;
}
