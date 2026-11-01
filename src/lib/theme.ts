export type Theme = "normal" | "pride";

/** Damon starts on the pride theme; everyone else on normal. Anyone can switch, and their choice sticks. */
export function defaultTheme(userId: string): Theme {
  return userId.trim().toLowerCase() === "damon" ? "pride" : "normal";
}

const key = (userId: string) => `cbt_theme_${userId}`;

/** The viewer's saved choice on this device, if any. Storage can be blocked (private mode), so never throw. */
export function storedTheme(userId: string): Theme | null {
  try {
    const value = localStorage.getItem(key(userId));
    return value === "pride" || value === "normal" ? value : null;
  } catch {
    return null;
  }
}

export function storeTheme(userId: string, theme: Theme): void {
  try {
    localStorage.setItem(key(userId), theme);
  } catch {
    // Blocked storage: the theme still applies for this visit, it just won't be remembered.
  }
}
