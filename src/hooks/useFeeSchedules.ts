import { useTabData } from "@/hooks/useTabData";
import { useRepoMutations } from "@/hooks/useRepoMutations";
import type { FeeSchedule } from "@/lib/validation/schemas";

export function useFeeSchedules(gameId?: string) {
  const { data, isLoading } = useTabData<FeeSchedule>("feeSchedules");
  const mutations = useRepoMutations("feeSchedules");
  const feeSchedules = gameId === undefined ? data : data.filter((f) => f.game_id === gameId);
  return { feeSchedules, isLoading, ...mutations };
}
