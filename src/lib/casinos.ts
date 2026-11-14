import { computeResultStats, sdPrior, type ResultStats } from "@/lib/stats/resultStats";
import { gamesByCasino, type GameSearchResult } from "@/lib/search";
import { normalizeCasinoKey, sessionCardrooms } from "@/lib/names";
import type { Session } from "@/lib/validation/schemas";

export interface CasinoSummary {
  room: string;
  /** Sessions at this room alone; a night across several rooms isn't split between them. */
  sessions: Session[];
  games: GameSearchResult[];
  stats: ResultStats;
}

/** Every room with sessions or games, most-played first, then by how many games are listed. */
export function casinoSummaries(sessions: Session[], games: GameSearchResult[]): CasinoSummary[] {
  const byKey = new Map<string, { room: string; sessions: Session[]; games: GameSearchResult[] }>();
  const entry = (room: string) => {
    const key = normalizeCasinoKey(room);
    const found = byKey.get(key) ?? { room, sessions: [], games: [] };
    byKey.set(key, found);
    return found;
  };
  for (const session of sessions) {
    const rooms = sessionCardrooms(session.casino);
    if (rooms.length === 1) entry(rooms[0]).sessions.push(session);
  }
  for (const section of gamesByCasino(games)) {
    if (section.casino !== "Unlisted") entry(section.casino).games = section.games;
  }
  const prior = sdPrior(sessions);
  return [...byKey.values()]
    .map((casino) => ({ ...casino, stats: computeResultStats(casino.sessions, prior) }))
    .sort(
      (a, b) =>
        b.stats.minutes - a.stats.minutes ||
        b.stats.completedCount - a.stats.completedCount ||
        b.games.length - a.games.length ||
        a.room.localeCompare(b.room),
    );
}

export function casinoHref(room: string): string {
  return `/casinos/${encodeURIComponent(room)}`;
}
