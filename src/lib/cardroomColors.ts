/** One color per room so tags read at a glance. Full class strings so Tailwind keeps them. */
const COLORS: Record<string, { badge: string; dot: string }> = {
  "Artichoke Joe's": { badge: "bg-green-500/15 text-green-300 border-green-400/50", dot: "bg-green-400" },
  M8trix: { badge: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-400/50", dot: "bg-fuchsia-400" },
  Oaks: { badge: "bg-amber-700/25 text-amber-200 border-amber-600/60", dot: "bg-amber-600" },
  "Bay 101": { badge: "bg-cyan-500/15 text-cyan-300 border-cyan-400/50", dot: "bg-cyan-400" },
  "Hollywood Park": { badge: "bg-rose-500/15 text-rose-300 border-rose-400/50", dot: "bg-rose-400" },
  Bicycle: { badge: "bg-blue-500/15 text-blue-300 border-blue-400/50", dot: "bg-blue-400" },
  Commerce: { badge: "bg-teal-500/15 text-teal-300 border-teal-400/50", dot: "bg-teal-400" },
  Hustler: { badge: "bg-indigo-500/15 text-indigo-300 border-indigo-400/50", dot: "bg-indigo-400" },
  Gardens: { badge: "bg-lime-500/15 text-lime-300 border-lime-400/50", dot: "bg-lime-400" },
};
const OTHER = { badge: "bg-slate-500/15 text-slate-300 border-slate-400/50", dot: "bg-slate-400" };

export function cardroomColor(room: string): { badge: string; dot: string } {
  return COLORS[room] ?? OTHER;
}
