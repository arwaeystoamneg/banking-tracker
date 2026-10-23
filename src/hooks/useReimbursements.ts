import { useTabData } from "@/hooks/useTabData";
import { useRepoMutations } from "@/hooks/useRepoMutations";
import type { Reimbursement } from "@/lib/validation/schemas";

export function useReimbursements() {
  const { data, isLoading } = useTabData<Reimbursement>("reimbursements");
  const mutations = useRepoMutations("reimbursements");
  return { reimbursements: data, isLoading, ...mutations };
}
