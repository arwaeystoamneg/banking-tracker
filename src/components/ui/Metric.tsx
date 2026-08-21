import type { ReactNode } from "react";

type Tone = "neutral" | "positive" | "negative" | "warning";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-foreground",
  positive: "text-emerald-400",
  negative: "text-red-400",
  warning: "text-amber-400",
};

/**
 * A single labeled figure. The value renders in tabular mono (`.num`) so numbers align down a
 * column and don't jitter as they change. `base` is the denominator a percentage is quoted against
 * (e.g. "of TTA") — per the domain doc, an edge without its base is not a number, so it renders
 * inline and un-truncated rather than in a tooltip.
 */
export function Metric({
  label,
  value,
  base,
  hint,
  tone = "neutral",
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode;
  base?: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
}) {
  const valueSize = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`num mt-0.5 font-semibold leading-tight ${valueSize} ${TONE_TEXT[tone]}`}>{value}</p>
      {base ? <p className="mt-0.5 text-xs leading-snug text-muted">{base}</p> : null}
      {hint ? <p className="mt-0.5 text-xs leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}
