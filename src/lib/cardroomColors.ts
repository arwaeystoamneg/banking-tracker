/** One color per room so tags read at a glance. Full class strings so Tailwind keeps them. */
const COLORS: Record<string, { badge: string; dot: string }> = {
  "Artichoke Joe's": { badge: "bg-pink-500/15 text-pink-300 border-pink-400/50", dot: "bg-pink-400" },
  M8trix: { badge: "bg-purple-700/30 text-purple-200 border-purple-500/70", dot: "bg-purple-600" },
  Oaks: { badge: "bg-[#7b4a26]/40 text-[#e3b98f] border-[#9a5f33]", dot: "bg-[#8b5a2b]" },
  "Bay 101": { badge: "bg-amber-400/15 text-amber-300 border-amber-400/60", dot: "bg-amber-400" },
  "Hollywood Park": { badge: "bg-black text-neutral-100 border-neutral-500", dot: "bg-black ring-1 ring-neutral-400" },
  Bicycle: { badge: "bg-blue-500/15 text-blue-300 border-blue-400/50", dot: "bg-blue-400" },
  Commerce: { badge: "bg-teal-500/15 text-teal-300 border-teal-400/50", dot: "bg-teal-400" },
  Hustler: { badge: "bg-cyan-500/15 text-cyan-300 border-cyan-400/50", dot: "bg-cyan-400" },
  Gardens: { badge: "bg-lime-500/15 text-lime-300 border-lime-400/50", dot: "bg-lime-400" },
};
const OTHER = { badge: "bg-slate-500/15 text-slate-300 border-slate-400/50", dot: "bg-slate-400" };

export function cardroomColor(room: string): { badge: string; dot: string } {
  return COLORS[room] ?? OTHER;
}
