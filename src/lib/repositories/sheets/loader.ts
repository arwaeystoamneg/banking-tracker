import "server-only";
import { cache } from "react";
import { getSheetId, getSheetsClient } from "@/lib/repositories/sheets/client";
import { ALL_TABS } from "@/lib/repositories/sheets/tabs";
import { fullTabRange } from "@/lib/repositories/sheets/rowMapper";
import { isSheetAlreadyExistsError } from "@/lib/repositories/sheets/googleErrors";

/**
 * One batched read for all six tabs, memoized per request via React's cache() — so a single page
 * render that touches multiple repositories (e.g. games + sidebets + paytables) issues one
 * spreadsheets.values.batchGet call instead of one per repository, respecting the 60 req/min/user quota.
 */
export const fetchAllTabsRaw = cache(async (spreadsheetId = getSheetId()): Promise<Record<string, string[][]>> => {
  const sheets = getSheetsClient();
  const present = await getSheetGridIds(spreadsheetId);
  const tabs = ALL_TABS.filter((tab) => present[tab.tabName] !== undefined);
  const result: Record<string, string[][]> = {};
  for (const tab of ALL_TABS) result[tab.tabName] = [];
  if (tabs.length === 0) return result;

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: tabs.map((tab) => fullTabRange(tab.tabName)),
  });

  (res.data.valueRanges ?? []).forEach((vr, i) => {
    const tab = tabs[i];
    if (tab) result[tab.tabName] = (vr.values as string[][] | undefined) ?? [];
  });
  return result;
});

// Sheet structure (which tab has which numeric grid id) changes rarely, so this is memoized globally
// rather than per-request.
const globalForGridIds = globalThis as unknown as {
  __sheetGridIds?: Map<string, Promise<Record<string, number>>>;
};

export function getSheetGridIds(spreadsheetId = getSheetId()): Promise<Record<string, number>> {
  if (!globalForGridIds.__sheetGridIds) globalForGridIds.__sheetGridIds = new Map();
  if (!globalForGridIds.__sheetGridIds.has(spreadsheetId)) {
    globalForGridIds.__sheetGridIds.set(spreadsheetId, (async () => {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.get({ spreadsheetId });
      const map: Record<string, number> = {};
      for (const sheet of res.data.sheets ?? []) {
        const title = sheet.properties?.title;
        const sheetId = sheet.properties?.sheetId;
        if (title !== undefined && title !== null && sheetId !== undefined && sheetId !== null) {
          map[title] = sheetId;
        }
      }
      return map;
    })());
  }
  return globalForGridIds.__sheetGridIds.get(spreadsheetId)!;
}

export function invalidateSheetGridIds(spreadsheetId: string): void {
  globalForGridIds.__sheetGridIds?.delete(spreadsheetId);
}

/**
 * Adds a worksheet if this spreadsheet doesn't have one by that title yet. First write of a new
 * tab (LossReports, etc.) would otherwise 500 on `Unable to parse range: Tab!1:1`.
 */
export async function ensureWorksheet(
  spreadsheetId: string,
  tabName: string,
  columnCount: number,
): Promise<void> {
  const present = await getSheetGridIds(spreadsheetId);
  if (present[tabName] !== undefined) return;

  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: tabName,
                gridProperties: {
                  frozenRowCount: 1,
                  rowCount: 2000,
                  columnCount: Math.max(26, columnCount),
                },
              },
            },
          },
        ],
      },
    });
    const sheetId = res.data.replies?.[0]?.addSheet?.properties?.sheetId;
    if (typeof sheetId === "number") present[tabName] = sheetId;
  } catch (err) {
    if (isSheetAlreadyExistsError(err)) {
      invalidateSheetGridIds(spreadsheetId);
      return;
    }
    throw err;
  }
}
