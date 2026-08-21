import { useLiveQuery } from "dexie-react-hooks";
import { useQuery } from "@tanstack/react-query";
import type { CacheTab } from "@/offline/db";
import { readTabCache, refreshTabCache } from "@/offline/cache";
import { useCurrentUser } from "@/components/providers/AuthProvider";

/**
 * Renders from Dexie instantly (works offline, reactive to the write queue's optimistic updates via
 * useLiveQuery), while TanStack Query drives a background revalidation fetch that repopulates Dexie.
 * This is the read path described in CLAUDE.md's offline-behavior section for every reference tab.
 */
export function useTabData<T>(tab: CacheTab) {
  const user = useCurrentUser();
  const cached = useLiveQuery(() => readTabCache<T>(tab), [tab, user.userId]);

  const { isFetching, error } = useQuery({
    queryKey: [tab, user.userId],
    queryFn: () => refreshTabCache(tab),
  });

  return { data: cached ?? [], isLoading: cached === undefined, isFetching, error };
}
