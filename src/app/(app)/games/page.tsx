"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useGames } from "@/hooks/useGames";
import { useSidebets } from "@/hooks/useSidebets";
import { usePaytables } from "@/hooks/usePaytables";
import { searchGames } from "@/lib/search";
import { GameCard } from "@/components/games/GameCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function GamesPage() {
  const { games, isLoading } = useGames();
  const { sidebets } = useSidebets();
  const { paytables } = usePaytables();
  const [query, setQuery] = useState("");
  const [casino, setCasino] = useState<string | null>(null);

  const casinos = useMemo(() => {
    const set = new Set<string>();
    for (const g of games) {
      for (const c of g.casinos.split("|")) {
        const trimmed = c.trim();
        if (trimmed) set.add(trimmed);
      }
    }
    return Array.from(set).sort();
  }, [games]);

  const results = useMemo(
    () => searchGames(games, sidebets, paytables, query, casino),
    [games, sidebets, paytables, query, casino],
  );

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Games</h1>
        <Link href="/games/new">
          <Button className="h-10 px-4 text-sm">+ Add</Button>
        </Link>
      </div>

      <Input
        placeholder="Search name, casino, side bet, or paytable outcome…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        inputMode="search"
      />

      {casinos.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setCasino(null)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
              casino === null ? "border-emerald-500 text-emerald-400" : "border-border text-muted"
            }`}
          >
            All casinos
          </button>
          {casinos.map((c) => (
            <button
              key={c}
              onClick={() => setCasino(c)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
                casino === c ? "border-emerald-500 text-emerald-400" : "border-border text-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-muted">No games match.</p>
      ) : (
        <div className="space-y-3">
          {results.map((game) => (
            <GameCard key={game.game_id} game={game} />
          ))}
        </div>
      )}
    </main>
  );
}
