import { useLiveQuery } from "dexie-react-hooks";
import { useQuery } from "@tanstack/react-query";
import type { QueueTab } from "@/offline/db";
import { readTabCache, refreshTabCache } from "@/offline/cache";

/**
 * Renders from Dexie instantly (works offline, reactive to the write queue's optimistic updates via
 * useLiveQuery), while TanStack Query drives a background revalidation fetch that repopulates Dexie.
 * This is the read path described in CLAUDE.md's offline-behavior section for every reference tab.
 */
export function useTabData<T>(tab: QueueTab) {
  const cached = useLiveQuery(() => readTabCache<T>(tab), [tab]);

  const { isFetching, error } = useQuery({
    queryKey: [tab],
    queryFn: () => refreshTabCache(tab),
  });

  return { data: cached ?? [], isLoading: cached === undefined, isFetching, error };
}
