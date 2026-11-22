import { describe, expect, it } from "vitest";
import { gameChoices, NO_GAME, sessionGameName, sessionsByGame } from "@/lib/sessionGames";
import type { Session } from "@/lib/validation/schemas";

const games = [
  { game_id: "gm_uth", name: "Ultimate Texas Hold'em" },
  { game_id: "gm_uth_bicycle", name: "Ultimate Texas Hold'em" },
  { game_id: "gm_3cp", name: "Three Card Poker" },
];
const s = (id: string, game_id: string) => ({ session_id: id, game_id }) as Session;

describe("session games", () => {
  it("offers one choice per game name", () => {
    expect(gameChoices(games)).toEqual([
      { id: "gm_3cp", name: "Three Card Poker" },
      { id: "gm_uth", name: "Ultimate Texas Hold'em" },
    ]);
  });

  it("groups versions of a game together, busiest first, untagged last", () => {
    const groups = sessionsByGame([s("a", "gm_uth"), s("b", "gm_uth_bicycle"), s("c", ""), s("d", "gm_3cp"), s("e", "gone")], games);
    expect(groups.map((group) => [group.label, group.sessions.length])).toEqual([
      ["Ultimate Texas Hold'em", 2],
      ["Three Card Poker", 1],
      ["gone", 1],
      [NO_GAME, 1],
    ]);
    expect(sessionGameName(s("x", ""), games)).toBe("");
  });
});
