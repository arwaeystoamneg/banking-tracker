import type { Game, Session } from "@/lib/validation/schemas";

/** Label for sessions with no game set. */
export const NO_GAME = "No game set";

/**
 * One choice per game name (a game with several versions, like UTH standard and UTH + Bad Beat, is still one
 * game for stats), alphabetical. The value stored on the session is the first version's game_id.
 */
export function gameChoices(games: Pick<Game, "game_id" | "name">[]): { id: string; name: string }[] {
  const byName = new Map<string, { id: string; name: string }>();
  for (const game of games) {
    const name = game.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, { id: game.game_id, name });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The game a session was played at, by name ("" when none is set; the raw id if the game was deleted). */
export function sessionGameName(session: Pick<Session, "game_id">, games: Pick<Game, "game_id" | "name">[]): string {
  const id = session.game_id.trim();
  if (!id) return "";
  return games.find((game) => game.game_id === id)?.name.trim() || id;
}

/** Sessions per game name, busiest first, with "No game set" last. */
export function sessionsByGame(sessions: Session[], games: Pick<Game, "game_id" | "name">[]): { label: string; sessions: Session[] }[] {
  const groups = new Map<string, { label: string; sessions: Session[] }>();
  for (const session of sessions) {
    const label = sessionGameName(session, games) || NO_GAME;
    const key = label.toLowerCase();
    const group = groups.get(key) ?? { label, sessions: [] };
    group.sessions.push(session);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => Number(a.label === NO_GAME) - Number(b.label === NO_GAME) || b.sessions.length - a.sessions.length,
  );
}
