import type { QueueTab } from "@/offline/db";
import { enqueueCreate, enqueueDelete, enqueueUpdate, flushQueue } from "@/offline/queue";
import { useCurrentUser } from "@/components/providers/AuthProvider";

/**
 * Every write in the app goes through the offline queue, even when online — this is what makes
 * "works offline" not a special case. flushQueue() is fired immediately afterward so an online write
 * feels instant rather than waiting for the next interval tick.
 */
export function useRepoMutations(tab: QueueTab) {
  const user = useCurrentUser();

  function assertWritable(): void {
    if (user.role === "demo") throw new Error("The public demo is read-only");
  }

  return {
    async create(payload: Record<string, unknown>): Promise<string> {
      assertWritable();
      const tempId = await enqueueCreate(tab, payload);
      void flushQueue();
      return tempId;
    },
    async update(id: string, patch: Record<string, unknown>, expectedVersion: number): Promise<void> {
      assertWritable();
      await enqueueUpdate(tab, id, patch, expectedVersion);
      void flushQueue();
    },
    async remove(id: string): Promise<void> {
      assertWritable();
      await enqueueDelete(tab, id);
      void flushQueue();
    },
  };
}
