import { sessionCardrooms } from "@/lib/names";
import { computeResultStats, type ResultStats, type SdPrior } from "@/lib/stats/resultStats";
import type { Session } from "@/lib/validation/schemas";

/** Rooms Ray reads as one group. */
const ROOM_GROUPS: Record<string, string> = { M8trix: "M8trix + Bay 101", "Bay 101": "M8trix + Bay 101" };

function roomGroup(session: Session): string {
  const rooms = [...new Set(sessionCardrooms(session.casino).map((room) => ROOM_GROUPS[room] ?? room))];
  return rooms.length === 0 ? "No room" : rooms.length === 1 ? rooms[0] : "Several rooms";
}

function money(value: number, signed = true): string {
  const sign = value < 0 ? "-" : signed && value > 0 ? "+" : "";
  const abs = Math.abs(value);
  return `${sign}$${abs >= 10000 ? `${(abs / 1000).toFixed(1)}k` : Math.round(abs).toLocaleString("en-US")}`;
}

function row(label: string, stats: ResultStats): string {
  const hours = `${Math.round(stats.minutes / 60)}h`;
  const hourly = stats.hourly === null ? "—" : money(stats.hourly.toNumber());
  const range = stats.hourlyRange ? `${money(stats.hourlyRange[0])} to ${money(stats.hourlyRange[1])}` : "—";
  const sd = stats.sdPerHour === null ? "—" : `${stats.sdIsRough ? "~" : ""}${money(stats.sdPerHour, false)}`;
  return [
    label.slice(0, 18).padEnd(18),
    String(stats.completedCount).padStart(4),
    hours.padStart(6),
    money(stats.net.toNumber()).padStart(9),
    hourly.padStart(7),
    range.padStart(17),
    sd.padStart(8),
  ].join(" ");
}

/**
 * A plain-text table for pasting into Discord: a code block (Discord doesn't render Markdown tables), one
 * row per player and indented rows per room group (M8trix and Bay 101 together). 95% range = t with each
 * group's own sessions − 1 df; "~" marks an SD topped up from similar-stakes sessions (10 or fewer of its own).
 */
export function discordStatsTable(input: {
  heading: string;
  players: { label: string; sessions: Session[] }[];
  prior?: SdPrior;
}): string {
  const header = [
    "Player / room".padEnd(18),
    "Sess".padStart(4),
    "Hours".padStart(6),
    "Net".padStart(9),
    "$/h".padStart(7),
    "95% range $/h".padStart(17),
    "SD/h".padStart(8),
  ].join(" ");
  const lines = [input.heading, "", header];
  for (const player of input.players) {
    const total = computeResultStats(player.sessions, input.prior);
    if (total.completedCount === 0) continue;
    lines.push(row(player.label, total));
    const groups = new Map<string, Session[]>();
    for (const session of player.sessions) {
      const group = roomGroup(session);
      groups.set(group, [...(groups.get(group) ?? []), session]);
    }
    if (groups.size < 2) continue;
    [...groups.entries()]
      .map(([room, sessions]) => ({ room, stats: computeResultStats(sessions, input.prior) }))
      .filter((group) => group.stats.completedCount > 0)
      .sort((a, b) => b.stats.minutes - a.stats.minutes)
      .forEach((group) => lines.push(row(`  ${group.room}`, group.stats)));
  }
  lines.push("", "95% range: t-dist, df = sessions - 1. ~ = SD borrows from similar stakes (10 or fewer sessions).");
  return "```\n" + lines.join("\n") + "\n```";
}
