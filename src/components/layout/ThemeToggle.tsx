"use client";

import { useEffect, useState } from "react";
import { defaultTheme, storedTheme, storeTheme, type Theme } from "@/lib/theme";

/** Switches between the normal and pride themes and remembers the choice per person on this device. */
export function ThemeToggle({ userId }: { userId: string }) {
  // Read on first render; on the server there's no storage, so it renders the default and the label is
  // corrected on hydration (hence suppressHydrationWarning on the button).
  const [theme, setTheme] = useState<Theme>(() => storedTheme(userId) ?? defaultTheme(userId));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function toggle() {
    const next: Theme = theme === "pride" ? "normal" : "pride";
    setTheme(next);
    storeTheme(userId, next);
  }

  return (
    <button type="button" onClick={toggle} className="min-h-9 px-2 text-muted-strong active:text-foreground" aria-pressed={theme === "pride"} suppressHydrationWarning>
      {theme === "pride" ? "Normal theme" : "Pride theme"}
    </button>
  );
}
