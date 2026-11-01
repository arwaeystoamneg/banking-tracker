export const THEMES = ["normal", "pride", "halloween"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABEL: Record<Theme, string> = { normal: "Normal", pride: "Pride", halloween: "Halloween" };

const isDamon = (userId: string) => userId.trim().toLowerCase() === "damon";

/** Damon starts on the pride theme; everyone else on normal. */
export function defaultTheme(userId: string): Theme {
  return isDamon(userId) ? "pride" : "normal";
}

/**
 * Where a choice is kept. Damon's lasts only while the app is open (sessionStorage), so every time he opens
 * it again it starts on pride; everyone else's is remembered on the device (localStorage).
 */
function storage(userId: string): Storage {
  return isDamon(userId) ? sessionStorage : localStorage;
}

const key = (userId: string) => `cbt_theme_${userId}`;

/** The saved choice, if any. Storage can be missing (server render) or blocked (private mode): never throw. */
export function storedTheme(userId: string): Theme | null {
  try {
    const value = storage(userId).getItem(key(userId));
    return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : null;
  } catch {
    return null;
  }
}

export function storeTheme(userId: string, theme: Theme): void {
  try {
    storage(userId).setItem(key(userId), theme);
  } catch {
    // Blocked storage: the theme still applies for this visit, it just won't be remembered.
  }
}
