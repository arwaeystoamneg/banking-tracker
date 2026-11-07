import "server-only";
import type { TabConfig } from "@/lib/repositories/sheets/tabs";

/** Reads header row + data rows for a tab and turns them into typed objects, matched by header name. */
export function sheetRowsToObjects(config: TabConfig, values: string[][]): Record<string, unknown>[] {
  return sheetRowsToObjectsWithPositions(config, values).map(({ value }) => value);
}

export interface PositionedSheetRow {
  value: Record<string, unknown>;
  rawRow: string[];
  sheetRowNumber: number;
}

/** Preserves physical row numbers so blank rows cannot shift update/delete targets. */
export function sheetRowsToObjectsWithPositions(config: TabConfig, values: string[][]): PositionedSheetRow[] {
  if (values.length === 0) return [];
  const [headerRow, ...dataRows] = values;
  const headerIndex = new Map<string, number>();
  headerRow.forEach((h, i) => headerIndex.set(h.trim(), i));

  return dataRows
    .map((row, index) => ({ row, sheetRowNumber: index + 2 }))
    .filter(({ row }) => row.some((cell) => cell !== undefined && cell !== ""))
    .map(({ row, sheetRowNumber }) => {
      const obj: Record<string, unknown> = {};
      for (const header of config.headers) {
        const colIndex = headerIndex.get(header);
        const raw = colIndex === undefined ? "" : (row[colIndex] ?? "");
        obj[header] = coerceCell(header, raw, config);
      }
      return { value: obj, rawRow: row, sheetRowNumber };
    });
}

/** A number as typed or shown in the sheet: "$15,000", "15,000" and " 15000 " are all 15000. */
function sheetNumber(raw: string): number {
  return Number(String(raw).replace(/[$,\s]/g, ""));
}

function coerceCell(header: string, raw: string, config: TabConfig): unknown {
  if (config.booleanFields.includes(header)) {
    return raw.trim().toUpperCase() === "TRUE";
  }
  if (config.nullableNumberFields.includes(header)) {
    return raw.trim() === "" ? null : sheetNumber(raw);
  }
  if (config.numberFields.includes(header)) {
    return raw.trim() === "" ? 0 : sheetNumber(raw);
  }
  return raw;
}

/** Turns a typed row object back into a plain array in header order, for writing to Sheets. */
export function objectToSheetRow(
  config: TabConfig,
  obj: Record<string, unknown>,
  headers: string[] = config.headers,
): (string | number)[] {
  return headers.map((header) => {
    const value = obj[header];
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    return value as string | number;
  });
}

/** A1-style range covering the full tab (header + data), used for batchGet. */
export function fullTabRange(tabName: string): string {
  return `${tabName}!A:ZZ`;
}
