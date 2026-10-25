import "server-only";
import { getSheetId, getSheetsClient } from "@/lib/repositories/sheets/client";
import { ALL_TABS } from "@/lib/repositories/sheets/tabs";
import { fullTabRange } from "@/lib/repositories/sheets/rowMapper";
import { isSheetAlreadyExistsError } from "@/lib/repositories/sheets/googleErrors";
import { createTtlCache } from "@/lib/repositories/sheets/ttlCache";

/** How long one batched read of every tab is reused before going back to Google. */
const TABS_TTL_MS = 5_000;
/** Worksheet titles change only when the app adds a tab (which updates this cache itself). */
const GRID_IDS_TTL_MS = 5 * 60_000;

const tabsCache = createTtlCache<Record<string, string[][]>>(TABS_TTL_MS);
const gridIdsCache = createTtlCache<Record<string, number>>(GRID_IDS_TTL_MS);

/**
 * One batched read for every tab (a single spreadsheets.values.batchGet), shared by every request on this
 * server for a few seconds — so a page touching several tabs, "Sync now" pulling all of them, and several
 * phones refreshing at once together cost one read instead of one each. Writes call
 * invalidateSheetCache, so whoever saved sees their change on the next read from this server.
 *
 * Only list reads use this. Writes re-read the live rows before changing them (see sheetsRepository),
 * so a few seconds of staleness here can never overwrite anyone's data.
 */
export function fetchAllTabsRaw(spreadsheetId = getSheetId()): Promise<Record<string, string[][]>> {
  return tabsCache.get(spreadsheetId, () => loadAllTabs(spreadsheetId));
}

/** The same batched read, bypassing the shared copy — for permission and version checks before a write. */
export async function fetchAllTabsFresh(spreadsheetId = getSheetId()): Promise<Record<string, string[][]>> {
  return loadAllTabs(spreadsheetId);
}

export function invalidateSheetCache(spreadsheetId = getSheetId()): void {
  tabsCache.invalidate(spreadsheetId);
}

async function loadAllTabs(spreadsheetId: string): Promise<Record<string, string[][]>> {
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
}

/**
 * Worksheet title → sheetId. Cached for minutes rather than per request: a tab another server creates is
 * picked up when this expires, and a write that needs a missing tab still goes through ensureWorksheet,
 * which treats "already exists" as success.
 */
export function getSheetGridIds(spreadsheetId = getSheetId()): Promise<Record<string, number>> {
  return gridIdsCache.get(spreadsheetId, async () => {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" });
    const map: Record<string, number> = {};
    for (const sheet of res.data.sheets ?? []) {
      const title = sheet.properties?.title;
      const sheetId = sheet.properties?.sheetId;
      if (title !== undefined && title !== null && sheetId !== undefined && sheetId !== null) {
        map[title] = sheetId;
      }
    }
    return map;
  });
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
    invalidateSheetCache(spreadsheetId);
  } catch (err) {
    if (isSheetAlreadyExistsError(err)) {
      // Same-request reads key off this map. React's cache() cannot be invalidated, so stamp
      // the title or fetchAllTabsRaw will skip a tab that just won the create race.
      present[tabName] = present[tabName] ?? -1;
      return;
    }
    throw err;
  }
}

/**
 * Widens a worksheet so `columnCount` columns exist. Sheets rejects a write past the grid's last column
 * ("exceeds grid limits"), and a sheet a person created by hand often has exactly as many columns as it had
 * headers, so appending a new header column needs room made first.
 */
export async function ensureColumnCount(spreadsheetId: string, tabName: string, columnCount: number): Promise<void> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title,gridProperties.columnCount)",
  });
  const sheet = (res.data.sheets ?? []).find((candidate) => candidate.properties?.title === tabName);
  const sheetId = sheet?.properties?.sheetId;
  const current = sheet?.properties?.gridProperties?.columnCount ?? 0;
  if (sheetId === undefined || sheetId === null || current >= columnCount) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ appendDimension: { sheetId, dimension: "COLUMNS", length: columnCount - current } }],
    },
  });
}
