import type { ReactNode } from "react";

/** One-tap choice pill, used for picking a person. */
export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors disabled:opacity-60 ${
        active
          ? "border-emerald-500/70 bg-emerald-600/20 text-foreground"
          : "border-border bg-surface text-muted-strong active:bg-surface-raised"
      }`}
    >
      {children}
    </button>
  );
}
