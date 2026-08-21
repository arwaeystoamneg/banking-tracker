import type { QueueTab } from "@/offline/db";
import { enqueueCreate, enqueueDelete, enqueueUpdate, flushQueue } from "@/offline/queue";

/**
 * Every write in the app goes through the offline queue, even when online — this is what makes
 * "works offline" not a special case. flushQueue() is fired immediately afterward so an online write
 * feels instant rather than waiting for the next interval tick.
 */
export function useRepoMutations(tab: QueueTab) {
  return {
    async create(payload: Record<string, unknown>): Promise<string> {
      const tempId = await enqueueCreate(tab, payload);
      void flushQueue();
      return tempId;
    },
    async update(id: string, patch: Record<string, unknown>, expectedVersion: number): Promise<void> {
      await enqueueUpdate(tab, id, patch, expectedVersion);
      void flushQueue();
    },
    async remove(id: string): Promise<void> {
      await enqueueDelete(tab, id);
      void flushQueue();
    },
  };
}
