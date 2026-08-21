import "server-only";
import { z } from "zod";
import { ConflictError, NotFoundError, type CrudRepository } from "@/lib/repositories/types";
import { getSheetId, getSheetsClient } from "@/lib/repositories/sheets/client";
import { fetchAllTabsRaw, ensureWorksheet } from "@/lib/repositories/sheets/loader";
import {
  fullTabRange,
  objectToSheetRow,
  sheetRowsToObjects,
  sheetRowsToObjectsWithPositions,
} from "@/lib/repositories/sheets/rowMapper";
import type { TabConfig } from "@/lib/repositories/sheets/tabs";
import { salvagePaytableRow, rowVersionMatches } from "@/lib/paytableRow";

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

const rowLocks = new Map<string, Promise<void>>();

async function withRowLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = rowLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  rowLocks.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (rowLocks.get(key) === current) rowLocks.delete(key);
  }
}

export function createSheetsRepository<T extends { _row_version: number }, TCreate, TPatch>(config: {
  tab: string;
  tabConfig: TabConfig;
  makeId: () => string;
  rowSchema: z.ZodType<T>;
  spreadsheetId?: string;
}): CrudRepository<T, TCreate, TPatch> {
  const { tab, tabConfig, makeId, rowSchema, spreadsheetId = getSheetId() } = config;

  async function ensureHeaders(): Promise<string[]> {
    const sheets = getSheetsClient();
    await withRowLock(`${spreadsheetId}:${tabConfig.tabName}:ensure-tab`, async () => {
      await ensureWorksheet(spreadsheetId, tabConfig.tabName, tabConfig.headers.length);
    });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabConfig.tabName}!1:1`,
    });
    const current = ((res.data.values?.[0] as string[] | undefined) ?? []).map((header) => header.trim());

    if (current.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
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
      spreadsheetId,
      range: `${tabConfig.tabName}!${columnLetter(current.length + 1)}1:${columnLetter(headers.length)}1`,
      valueInputOption: "RAW",
      requestBody: { values: [missing] },
    });
    return headers;
  }

  async function list(): Promise<T[]> {
    const allTabs = await fetchAllTabsRaw(spreadsheetId);
    const raw = allTabs[tabConfig.tabName] ?? [];
    const listed: T[] = [];
    for (const row of sheetRowsToObjects(tabConfig, raw)) {
      const parsed = rowSchema.safeParse(row);
      if (parsed.success) {
        listed.push(parsed.data);
        continue;
      }
      if (tab === "Paytables") {
        const salvaged = salvagePaytableRow(row);
        if (salvaged) listed.push(salvaged as unknown as T);
      }
    }
    return listed;
  }

  return {
    list,

    async get(id) {
      const rows = await list();
      return rows.find((r) => (r as unknown as Record<string, unknown>)[tabConfig.idField] === id) ?? null;
    },

    async create(data, id) {
      const rowId = id ?? makeId();
      return withRowLock(`${spreadsheetId}:${tabConfig.tabName}:${rowId}`, async () => {
        const sheets = getSheetsClient();
        const headers = await ensureHeaders();
        const existing = (await list()).find(
          (candidate) => (candidate as unknown as Record<string, unknown>)[tabConfig.idField] === rowId,
        );
        if (existing) return existing;
        const row = { [tabConfig.idField]: rowId, ...(data as object), _row_version: 1 };
        const parsed = rowSchema.parse(row);
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${tabConfig.tabName}!A:${columnLetter(headers.length)}`,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: [objectToSheetRow(tabConfig, parsed as unknown as Record<string, unknown>, headers)] },
        });
        return parsed;
      });
    },

    async update(id, patch, expectedVersion) {
      return withRowLock(`${spreadsheetId}:${tabConfig.tabName}:${id}`, async () => {
      // Fresh (non-cached) read-modify-write: this deliberately bypasses the per-request batched
      // loader so a write always checks against the row as it exists right now, not a stale
      // request-scoped snapshot.
      const sheets = getSheetsClient();
      const headers = await ensureHeaders();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: fullTabRange(tabConfig.tabName),
      });
      const values = (res.data.values as string[][] | undefined) ?? [];
      const positionedRows = sheetRowsToObjectsWithPositions(tabConfig, values);
      const positioned = positionedRows.find(({ value }) => value[tabConfig.idField] === id);
      if (!positioned) throw new NotFoundError(tab, id);

      const existing = positioned.value;
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
      const existingRawRow = positioned.rawRow;
      const serialized = objectToSheetRow(tabConfig, parsed as unknown as Record<string, unknown>, headers);
      headers.forEach((header, index) => {
        if (!tabConfig.headers.includes(header)) serialized[index] = existingRawRow[index] ?? "";
      });

      const sheetRowNumber = positioned.sheetRowNumber;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabConfig.tabName}!A${sheetRowNumber}:${columnLetter(headers.length)}${sheetRowNumber}`,
        valueInputOption: "RAW",
        requestBody: { values: [serialized] },
      });

        return parsed;
      });
    },

    async remove(id, expectedVersion) {
      return withRowLock(`${spreadsheetId}:${tabConfig.tabName}:${id}`, async () => {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: fullTabRange(tabConfig.tabName),
      });
      const values = (res.data.values as string[][] | undefined) ?? [];
      const positioned = sheetRowsToObjectsWithPositions(tabConfig, values).find(
        ({ value }) => value[tabConfig.idField] === id,
      );
      if (!positioned) return;
      if (!rowVersionMatches(positioned.value._row_version, expectedVersion)) {
        throw new ConflictError(tab, id, rowSchema.safeParse(positioned.value).success
          ? rowSchema.parse(positioned.value)
          : positioned.value);
      }

      // Clear instead of deleting the dimension. Stable physical row numbers prevent concurrent
      // deletes from shifting another request's target; blank rows are preserved by the mapper.
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${tabConfig.tabName}!A${positioned.sheetRowNumber}:${columnLetter(values[0]?.length ?? tabConfig.headers.length)}${positioned.sheetRowNumber}`,
      });
      });
    },
  };
}
