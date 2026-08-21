import { useTabData } from "@/hooks/useTabData";
import type { AuditEntry } from "@/lib/validation/schemas";

export function useAuditLog(lossId?: string) {
  const { data, isLoading } = useTabData<AuditEntry>("auditLog");
  const entries = lossId ? data.filter((row) => row.loss_id === lossId) : data;
  return { entries, isLoading };
}
