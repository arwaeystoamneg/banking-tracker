"use client";

import { useEffect, useState } from "react";
import { defaultTheme, storedTheme, storeTheme, THEME_LABEL, THEMES, type Theme } from "@/lib/theme";

/** Theme picker in the top bar. The choice is remembered per person on this device. */
export function ThemeToggle({ userId }: { userId: string }) {
  // Read on first render; on the server there's no storage, so it renders the default and the value is
  // corrected on hydration (hence suppressHydrationWarning).
  const [theme, setTheme] = useState<Theme>(() => storedTheme(userId) ?? defaultTheme(userId));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <label className="flex min-h-9 items-center gap-1 px-2 text-muted-strong">
      <span className="sr-only">Theme</span>
      <select
        value={theme}
        onChange={(e) => {
          const next = e.target.value as Theme;
          setTheme(next);
          storeTheme(userId, next);
        }}
        suppressHydrationWarning
        className="rounded-md border border-border bg-transparent px-1.5 py-0.5 text-xs text-muted-strong outline-none"
      >
        {THEMES.map((value) => (
          <option key={value} value={value} className="bg-surface text-foreground">
            {THEME_LABEL[value]}
          </option>
        ))}
      </select>
    </label>
  );
}
