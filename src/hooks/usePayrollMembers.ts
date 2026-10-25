import { useTabData } from "@/hooks/useTabData";
import { useRepoMutations } from "@/hooks/useRepoMutations";
import type { PayrollMember } from "@/lib/validation/schemas";

export function usePayrollMembers() {
  const { data, isLoading } = useTabData<PayrollMember>("payrollMembers");
  const mutations = useRepoMutations("payrollMembers");
  return { payrollMembers: data, isLoading, ...mutations };
}
