import type { Game, Paytable, Sidebet } from "@/lib/validation/schemas";

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
  const casinoFilter = casino ? normalize(casino) : null;

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
    .filter((game) => (casinoFilter ? normalize(game.casinos).includes(casinoFilter) : true))
    .map((game) => ({ game, sidebets: sidebetsByGame.get(game.game_id) ?? [] }))
    .filter(({ game, sidebets: gameSidebets }) => {
      if (!q) return true;
      if (normalize(game.name).includes(q) || normalize(game.casinos).includes(q)) return true;
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
