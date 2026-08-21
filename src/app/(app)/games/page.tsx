"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useGames } from "@/hooks/useGames";
import { useSidebets } from "@/hooks/useSidebets";
import { usePaytables } from "@/hooks/usePaytables";
import { searchGames } from "@/lib/search";
import { canonicalCasino, normalizeCasinoKey } from "@/lib/names";
import { maxPayoutMultiple } from "@/lib/payout";
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
    // De-dupe rooms by normalized key so "The Bicycle", "bicycle", and "Bicycle" are one chip.
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

  const sidebetCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sb of sidebets) counts.set(sb.game_id, (counts.get(sb.game_id) ?? 0) + 1);
    return counts;
  }, [sidebets]);

  // Worst-case bank tail per game = largest funded payout multiple across its side bets' paytables.
  const maxTails = useMemo(() => {
    const payoutsBySidebet = new Map<string, string[]>();
    for (const pt of paytables) {
      const list = payoutsBySidebet.get(pt.sidebet_id) ?? [];
      list.push(pt.payout);
      payoutsBySidebet.set(pt.sidebet_id, list);
    }
    const byGame = new Map<string, number>();
    for (const sb of sidebets) {
      const m = maxPayoutMultiple(payoutsBySidebet.get(sb.sidebet_id) ?? []);
      if (m === null) continue;
      byGame.set(sb.game_id, Math.max(byGame.get(sb.game_id) ?? 0, m));
    }
    return byGame;
  }, [sidebets, paytables]);

  const results = useMemo(
    () => searchGames(games, sidebets, paytables, query, casino),
    [games, sidebets, paytables, query, casino],
  );

  return (
    <main className="mx-auto max-w-lg px-4 pb-8">
      <div className="flex items-end justify-between pt-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Games</h1>
          <p className="text-sm text-muted">
            {isLoading ? "Loading…" : `${games.length} game${games.length === 1 ? "" : "s"} on file`}
          </p>
        </div>
        {user.role !== "demo" ? (
          <Link href="/games/new">
            <Button className="h-10 px-4 text-sm">+ Add</Button>
          </Link>
        ) : null}
      </div>

      {/* Search + filters stay pinned so they remain reachable one-handed while scrolling the list. */}
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
        <div className="space-y-3">
          {query || casino ? (
            <p className="text-xs text-muted">
              {results.length} match{results.length === 1 ? "" : "es"}
            </p>
          ) : null}
          {results.map((game) => (
            <GameCard
              key={game.game_id}
              game={game}
              sidebetCount={sidebetCounts.get(game.game_id) ?? 0}
              maxTail={maxTails.get(game.game_id) ?? null}
            />
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
