import { useTabData } from "@/hooks/useTabData";
import { useRepoMutations } from "@/hooks/useRepoMutations";
import type { LoanEntry } from "@/lib/validation/schemas";

export function useLoans() {
  const { data, isLoading } = useTabData<LoanEntry>("loans");
  const mutations = useRepoMutations("loans");
  return { loans: data, isLoading, ...mutations };
}
