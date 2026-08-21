import { useTabData } from "@/hooks/useTabData";
import { useRepoMutations } from "@/hooks/useRepoMutations";
import type { Sidebet } from "@/lib/validation/schemas";

export function useSidebets(gameId?: string) {
  const { data, isLoading } = useTabData<Sidebet>("sidebets");
  const mutations = useRepoMutations("sidebets");
  const sidebets = gameId ? data.filter((s) => s.game_id === gameId) : data;
  return { sidebets, isLoading, ...mutations };
}
