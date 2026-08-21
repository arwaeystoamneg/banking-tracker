import "server-only";
import { cache } from "react";
import { getSheetId, getSheetsClient } from "@/lib/repositories/sheets/client";
import { ALL_TABS } from "@/lib/repositories/sheets/tabs";
import { fullTabRange } from "@/lib/repositories/sheets/rowMapper";

/**
 * One batched read for all six tabs, memoized per request via React's cache() — so a single page
 * render that touches multiple repositories (e.g. games + sidebets + paytables) issues one
 * spreadsheets.values.batchGet call instead of one per repository, respecting the 60 req/min/user quota.
 */
export const fetchAllTabsRaw = cache(async (): Promise<Record<string, string[][]>> => {
  const sheets = getSheetsClient();
  const ranges = ALL_TABS.map((t) => fullTabRange(t.tabName));
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: getSheetId(),
    ranges,
  });

  const result: Record<string, string[][]> = {};
  (res.data.valueRanges ?? []).forEach((vr, i) => {
    result[ALL_TABS[i].tabName] = (vr.values as string[][] | undefined) ?? [];
  });
  return result;
});

// Sheet structure (which tab has which numeric grid id) changes rarely, so this is memoized globally
// rather than per-request.
const globalForGridIds = globalThis as unknown as { __sheetGridIds?: Promise<Record<string, number>> };

export function getSheetGridIds(): Promise<Record<string, number>> {
  if (!globalForGridIds.__sheetGridIds) {
    globalForGridIds.__sheetGridIds = (async () => {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.get({ spreadsheetId: getSheetId() });
      const map: Record<string, number> = {};
      for (const sheet of res.data.sheets ?? []) {
        const title = sheet.properties?.title;
        const sheetId = sheet.properties?.sheetId;
        if (title !== undefined && title !== null && sheetId !== undefined && sheetId !== null) {
          map[title] = sheetId;
        }
      }
      return map;
    })();
  }
  return globalForGridIds.__sheetGridIds;
}
