import { useTabData } from "@/hooks/useTabData";
import { useRepoMutations } from "@/hooks/useRepoMutations";
import type { Round } from "@/lib/validation/schemas";

export function useRounds(sessionId?: string) {
  const { data, isLoading } = useTabData<Round>("rounds");
  const mutations = useRepoMutations("rounds");
  const rounds = sessionId ? data.filter((r) => r.session_id === sessionId) : data;
  return { rounds, isLoading, ...mutations };
}
