import { db, type CacheTab } from "@/offline/db";
import { TAB_CLIENT_CONFIG } from "@/offline/tabConfig";
import { readApiError } from "@/lib/api/readError";
import type { LossDecisionInput, LossReport } from "@/lib/validation/schemas";

/**
 * Online-only create: POST straight to the API and put the returned row in Dexie.
 * Loss tabs must never enter the write queue — a queued text row with photos that didn't
 * upload is a false-complete report, which is this feature's worst failure mode.
 */
export async function postAndCache<T>(tab: CacheTab, payload: object, id?: string): Promise<T> {
  const { apiPath } = TAB_CLIENT_CONFIG[tab];
  const res = await fetch(apiPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(id ? { ...payload, id } : payload),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  const created = (await res.json()) as T;
  if (db) await db.table(tab).put(created);
  return created;
}

export async function postLossDecision(
  id: string,
  decision: LossDecisionInput,
  expectedVersion: number,
): Promise<LossReport> {
  const res = await fetch(`/api/losses/${id}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, expectedVersion }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  const updated = (await res.json()) as LossReport;
  if (db) await db.lossReports.put(updated);
  return updated;
}
