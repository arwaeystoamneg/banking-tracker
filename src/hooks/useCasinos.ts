"use client";

import { useMemo } from "react";
import { useSessions } from "@/hooks/useSessions";
import { useGames } from "@/hooks/useGames";
import { useSidebets } from "@/hooks/useSidebets";
import { usePaytables } from "@/hooks/usePaytables";
import { searchGames } from "@/lib/search";
import { casinoSummaries } from "@/lib/casinos";

/** Each room's sessions, results and listed games. */
export function useCasinos() {
  const { sessions, isLoading: sessionsLoading } = useSessions();
  const { games, isLoading: gamesLoading } = useGames();
  const { sidebets } = useSidebets();
  const { paytables } = usePaytables();
  const casinos = useMemo(
    () => casinoSummaries(sessions, searchGames(games, sidebets, paytables, "", null)),
    [sessions, games, sidebets, paytables],
  );
  return { casinos, isLoading: sessionsLoading || gamesLoading };
}
