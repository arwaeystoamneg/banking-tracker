import { useTabData } from "@/hooks/useTabData";
import type { LossReport } from "@/lib/validation/schemas";
import { postAndCache, postLossDecision } from "@/offline/onlineWrite";
import type { LossDecisionInput, LossReportSubmission } from "@/lib/validation/schemas";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { db } from "@/offline/db";

export function useLossReports() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const { data, isLoading } = useTabData<LossReport>("lossReports");

  return {
    reports: data,
    isLoading,
    async create(payload: LossReportSubmission, id?: string): Promise<LossReport> {
      if (user.role === "demo") throw new Error("The public demo is read-only");
      const created = await postAndCache<LossReport>("lossReports", payload, id);
      await queryClient.invalidateQueries({ queryKey: ["lossReports", user.userId] });
      return created;
    },
    async decide(id: string, decision: LossDecisionInput, expectedVersion: number): Promise<LossReport> {
      if (user.role === "demo") throw new Error("The public demo is read-only");
      const updated = await postLossDecision(id, decision, expectedVersion);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lossReports", user.userId] }),
        queryClient.invalidateQueries({ queryKey: ["auditLog", user.userId] }),
      ]);
      return updated;
    },
    async refresh(): Promise<void> {
      await queryClient.invalidateQueries({ queryKey: ["lossReports", user.userId] });
      if (db) await queryClient.invalidateQueries({ queryKey: ["lossEvidence", user.userId] });
    },
  };
}
