import { useTabData } from "@/hooks/useTabData";
import { useRepoMutations } from "@/hooks/useRepoMutations";
import type { Paytable } from "@/lib/validation/schemas";

export function usePaytables(sidebetId?: string) {
  const { data, isLoading } = useTabData<Paytable>("paytables");
  const mutations = useRepoMutations("paytables");
  const paytables = sidebetId ? data.filter((p) => p.sidebet_id === sidebetId) : data;
  return { paytables, isLoading, ...mutations };
}
