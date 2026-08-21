import type { Game, Paytable, Sidebet } from "@/lib/validation/schemas";
import { canonicalCasinoList, normalizeCasinoKey } from "@/lib/names";

export interface GameSearchResult extends Game {
  sidebets: Sidebet[];
}

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Search must hit paytables — at a table you recognize a bet by its top payout before its name.
 * Matches across the game's own fields, its side bets' names, and their paytable outcome/payout text.
 */
export function searchGames(
  games: Game[],
  sidebets: Sidebet[],
  paytables: Paytable[],
  query: string,
  casino: string | null,
): GameSearchResult[] {
  const q = normalize(query);
  // The selected casino is a canonical display name; match on its normalized key so a game listed
  // as "The Bicycle" still matches the "Bicycle" chip.
  const casinoFilterKey = casino ? normalizeCasinoKey(casino) : null;

  const sidebetsByGame = new Map<string, Sidebet[]>();
  for (const sb of sidebets) {
    const list = sidebetsByGame.get(sb.game_id) ?? [];
    list.push(sb);
    sidebetsByGame.set(sb.game_id, list);
  }

  const paytablesBySidebet = new Map<string, Paytable[]>();
  for (const pt of paytables) {
    const list = paytablesBySidebet.get(pt.sidebet_id) ?? [];
    list.push(pt);
    paytablesBySidebet.set(pt.sidebet_id, list);
  }

  return games
    .filter((game) =>
      casinoFilterKey
        ? canonicalCasinoList(game.casinos).some((c) => normalizeCasinoKey(c) === casinoFilterKey)
        : true,
    )
    .map((game) => ({ game, sidebets: sidebetsByGame.get(game.game_id) ?? [] }))
    .filter(({ game, sidebets: gameSidebets }) => {
      if (!q) return true;
      // Also match the canonical room names so "hpc" finds a game listed under "Hollywood Park".
      const canonicalCasinos = normalize(canonicalCasinoList(game.casinos).join(" "));
      if (normalize(game.name).includes(q) || normalize(game.casinos).includes(q) || canonicalCasinos.includes(q))
        return true;
      for (const sb of gameSidebets) {
        if (normalize(sb.name).includes(q) || normalize(sb.top_payout).includes(q)) return true;
        const rows = paytablesBySidebet.get(sb.sidebet_id) ?? [];
        for (const pt of rows) {
          if (normalize(pt.outcome).includes(q) || normalize(pt.payout).includes(q)) return true;
        }
      }
      return false;
    })
    .map(({ game, sidebets: gameSidebets }) => ({ ...game, sidebets: gameSidebets }));
}

/**
 * Floor view: each room is a section, and a game that spreads at several rooms appears under each.
 * Games with an empty casinos field land in "Unlisted" so they don't vanish.
 */
export function gamesByCasino(games: GameSearchResult[]): { casino: string; games: GameSearchResult[] }[] {
  const byKey = new Map<string, { casino: string; games: GameSearchResult[] }>();
  for (const game of games) {
    const rooms = canonicalCasinoList(game.casinos);
    const targets = rooms.length > 0 ? rooms : ["Unlisted"];
    for (const room of targets) {
      const key = normalizeCasinoKey(room);
      const bucket = byKey.get(key) ?? { casino: room, games: [] };
      bucket.games.push(game);
      byKey.set(key, bucket);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.casino.localeCompare(b.casino));
}
