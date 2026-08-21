const KEY = "cbt_logged_by";

/** No user accounts (per CLAUDE.md) — just remember the last name typed, per device. */
export function getRememberedLoggedBy(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY) ?? "";
}

export function rememberLoggedBy(name: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, name);
}
