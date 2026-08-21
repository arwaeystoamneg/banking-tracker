"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useGames } from "@/hooks/useGames";
import { useSidebets } from "@/hooks/useSidebets";
import { usePaytables } from "@/hooks/usePaytables";
import { gamesByCasino, searchGames } from "@/lib/search";
import { canonicalCasino, normalizeCasinoKey } from "@/lib/names";
import { isMainWagerSidebet, sidebetAppliesAtCasino } from "@/lib/gameFamily";
import { GameCard } from "@/components/games/GameCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useCurrentUser } from "@/components/providers/AuthProvider";

export default function GamesPage() {
  const user = useCurrentUser();
  const { games, isLoading } = useGames();
  const { sidebets } = useSidebets();
  const { paytables } = usePaytables();
  const [query, setQuery] = useState("");
  const [casino, setCasino] = useState<string | null>(null);

  const casinos = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const g of games) {
      for (const c of g.casinos.split("|")) {
        const trimmed = c.trim();
        if (!trimmed) continue;
        const display = canonicalCasino(trimmed);
        byKey.set(normalizeCasinoKey(display), display);
      }
    }
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
  }, [games]);

  const results = useMemo(
    () => searchGames(games, sidebets, paytables, query, casino),
    [games, sidebets, paytables, query, casino],
  );
  const grouped = useMemo(() => gamesByCasino(results), [results]);

  return (
    <main className="mx-auto max-w-lg px-4 pb-8">
      <div className="flex items-end justify-between pt-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Games</h1>
          <p className="text-sm text-muted">
            {isLoading
              ? "Loading…"
              : `${casinos.length} casino${casinos.length === 1 ? "" : "s"} · ${games.length} game${games.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {user.role !== "demo" ? (
          <Link href="/games/new">
            <Button className="h-10 px-4 text-sm">+ Add</Button>
          </Link>
        ) : null}
      </div>

      <div className="sticky top-0 z-20 -mx-4 space-y-3 bg-background/95 px-4 pb-3 pt-3 backdrop-blur">
        <Input
          placeholder="Search name, casino, side bet, or payout…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          inputMode="search"
          type="search"
        />

        {casinos.length > 0 ? (
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            <FilterChip active={casino === null} onClick={() => setCasino(null)}>
              All
            </FilterChip>
            {casinos.map((c) => (
              <FilterChip key={c} active={casino === c} onClick={() => setCasino(c)}>
                {c}
              </FilterChip>
            ))}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-surface" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState query={query} canAdd={user.role !== "demo"} />
      ) : (
        <div className="space-y-8">
          {query ? (
            <p className="text-xs text-muted">
              {results.length} match{results.length === 1 ? "" : "es"}
            </p>
          ) : null}
          {grouped.map((section) => (
            <section key={section.casino} className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted">{section.casino}</h2>
              {section.games.map((game) => {
                const names = game.sidebets
                  .filter((sb) => !isMainWagerSidebet(sb.name) && sidebetAppliesAtCasino(sb.name, section.casino))
                  .map((sb) => sb.name);
                return (
                  <GameCard
                    key={`${section.casino}-${game.game_id}`}
                    game={game}
                    hideCasinos
                    sidebetCount={names.length}
                    sidebetNames={names}
                  />
                );
              })}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
          : "border-border text-muted active:bg-surface-raised"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ query, canAdd }: { query: string; canAdd: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-4 py-10 text-center">
      <p className="text-sm text-muted">
        {query ? `No games match “${query}”.` : "No games yet."}
      </p>
      {!query && canAdd ? (
        <Link href="/games/new" className="mt-3 inline-block">
          <Button variant="secondary" className="h-10 px-4 text-sm">
            Add the first game
          </Button>
        </Link>
      ) : null}
    </div>
  );
}
