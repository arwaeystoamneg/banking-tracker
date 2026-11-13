import type { ReactNode } from "react";

type Tone = "neutral" | "warning" | "danger" | "accent" | "sponsor" | "room";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-raised text-muted border-border",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  danger: "bg-red-500/10 text-red-400 border-red-500/30",
  accent: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  sponsor: "bg-violet-500/15 text-violet-300 border-violet-400/50 font-semibold",
  room: "bg-sky-500/15 text-sky-300 border-sky-400/50 font-semibold",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
