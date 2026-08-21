import { useTabData } from "@/hooks/useTabData";
import type { LossEvidence, LossEvidenceSubmission } from "@/lib/validation/schemas";
import { postAndCache } from "@/offline/onlineWrite";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/components/providers/AuthProvider";

export function useLossEvidence(lossId?: string) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const { data, isLoading } = useTabData<LossEvidence>("lossEvidence");
  const evidence = lossId ? data.filter((row) => row.loss_id === lossId) : data;

  return {
    evidence,
    isLoading,
    async create(payload: LossEvidenceSubmission, id?: string): Promise<LossEvidence> {
      if (user.role === "demo") throw new Error("The public demo is read-only");
      const created = await postAndCache<LossEvidence>("lossEvidence", payload, id);
      await queryClient.invalidateQueries({ queryKey: ["lossEvidence", user.userId] });
      return created;
    },
  };
}
