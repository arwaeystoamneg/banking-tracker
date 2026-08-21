import { useTabData } from "@/hooks/useTabData";
import { useRepoMutations } from "@/hooks/useRepoMutations";
import type { Session } from "@/lib/validation/schemas";

export function useSessions() {
  const { data, isLoading } = useTabData<Session>("sessions");
  const mutations = useRepoMutations("sessions");
  return { sessions: data, isLoading, ...mutations };
}
