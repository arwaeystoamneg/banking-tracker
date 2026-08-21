import "server-only";
import type { z } from "zod";
import { getSheetId, getSheetsClient } from "@/lib/repositories/sheets/client";
import { fetchAllTabsRaw, getSheetGridIds } from "@/lib/repositories/sheets/loader";
import { fullTabRange, objectToSheetRow, sheetRowsToObjects } from "@/lib/repositories/sheets/rowMapper";
import type { TabConfig } from "@/lib/repositories/sheets/tabs";
import { ConflictError, NotFoundError, type CrudRepository } from "@/lib/repositories/types";

function columnLetter(n: number): string {
  let s = "";
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

export function createSheetsRepository<T extends { _row_version: number }, TCreate, TPatch>(config: {
  tab: string;
  tabConfig: TabConfig;
  makeId: () => string;
  rowSchema: z.ZodType<T>;
}): CrudRepository<T, TCreate, TPatch> {
  const { tab, tabConfig, makeId, rowSchema } = config;

  async function ensureHeaders(): Promise<string[]> {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: getSheetId(),
      range: `${tabConfig.tabName}!1:1`,
    });
    const current = ((res.data.values?.[0] as string[] | undefined) ?? []).map((header) => header.trim());

    if (current.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: getSheetId(),
        range: `${tabConfig.tabName}!A1:${columnLetter(tabConfig.headers.length)}1`,
        valueInputOption: "RAW",
        requestBody: { values: [tabConfig.headers] },
      });
      return [...tabConfig.headers];
    }

    const missing = tabConfig.headers.filter((header) => !current.includes(header));
    if (missing.length === 0) return current;

    const headers = [...current, ...missing];
    await sheets.spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range: `${tabConfig.tabName}!${columnLetter(current.length + 1)}1:${columnLetter(headers.length)}1`,
      valueInputOption: "RAW",
      requestBody: { values: [missing] },
    });
    return headers;
  }

  async function list(): Promise<T[]> {
    const allTabs = await fetchAllTabsRaw();
    const raw = allTabs[tabConfig.tabName] ?? [];
    return sheetRowsToObjects(tabConfig, raw).map((r) => rowSchema.parse(r));
  }

  return {
    list,

    async get(id) {
      const rows = await list();
      return rows.find((r) => (r as unknown as Record<string, unknown>)[tabConfig.idField] === id) ?? null;
    },

    async create(data, id) {
      const sheets = getSheetsClient();
      const headers = await ensureHeaders();
      const rowId = id ?? makeId();
      const row = { [tabConfig.idField]: rowId, ...(data as object), _row_version: 1 };
      const parsed = rowSchema.parse(row);
      await sheets.spreadsheets.values.append({
        spreadsheetId: getSheetId(),
        range: fullTabRange(tabConfig.tabName),
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [objectToSheetRow(tabConfig, parsed as unknown as Record<string, unknown>, headers)] },
      });
      return parsed;
    },

    async update(id, patch, expectedVersion) {
      // Fresh (non-cached) read-modify-write: this deliberately bypasses the per-request batched
      // loader so a write always checks against the row as it exists right now, not a stale
      // request-scoped snapshot.
      const sheets = getSheetsClient();
      const headers = await ensureHeaders();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: getSheetId(),
        range: fullTabRange(tabConfig.tabName),
      });
      const values = (res.data.values as string[][] | undefined) ?? [];
      const objects = sheetRowsToObjects(tabConfig, values);
      const rowIndexInData = objects.findIndex((r) => r[tabConfig.idField] === id);
      if (rowIndexInData === -1) throw new NotFoundError(tab, id);

      const existing = objects[rowIndexInData];
      const existingVersion = existing._row_version as number;
      if (existingVersion !== expectedVersion) {
        throw new ConflictError(tab, id, rowSchema.parse(existing));
      }

      const updated = {
        ...existing,
        ...(patch as object),
        [tabConfig.idField]: id,
        _row_version: existingVersion + 1,
      };
      const parsed = rowSchema.parse(updated);
      const existingRawRow = values[rowIndexInData + 1] ?? [];
      const serialized = objectToSheetRow(tabConfig, parsed as unknown as Record<string, unknown>, headers);
      headers.forEach((header, index) => {
        if (!tabConfig.headers.includes(header)) serialized[index] = existingRawRow[index] ?? "";
      });

      // +2: values[] excludes the header row, and Sheets rows are 1-indexed.
      const sheetRowNumber = rowIndexInData + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: getSheetId(),
        range: `${tabConfig.tabName}!A${sheetRowNumber}:${columnLetter(headers.length)}${sheetRowNumber}`,
        valueInputOption: "RAW",
        requestBody: { values: [serialized] },
      });

      return parsed;
    },

    async remove(id) {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: getSheetId(),
        range: fullTabRange(tabConfig.tabName),
      });
      const values = (res.data.values as string[][] | undefined) ?? [];
      const objects = sheetRowsToObjects(tabConfig, values);
      const rowIndexInData = objects.findIndex((r) => r[tabConfig.idField] === id);
      if (rowIndexInData === -1) return;

      const gridIds = await getSheetGridIds();
      const sheetId = gridIds[tabConfig.tabName];
      if (sheetId === undefined) throw new Error(`Unknown sheet grid id for tab ${tabConfig.tabName}`);

      const sheetRowNumber = rowIndexInData + 2; // 1-indexed, +1 for header
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: getSheetId(),
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: "ROWS",
                  startIndex: sheetRowNumber - 1, // deleteDimension is 0-indexed
                  endIndex: sheetRowNumber,
                },
              },
            },
          ],
        },
      });
    },
  };
}
