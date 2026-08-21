import { useTabData } from "@/hooks/useTabData";
import { useRepoMutations } from "@/hooks/useRepoMutations";
import type { Game } from "@/lib/validation/schemas";

export function useGames() {
  const { data, isLoading } = useTabData<Game>("games");
  const mutations = useRepoMutations("games");
  return { games: data, isLoading, ...mutations };
}
