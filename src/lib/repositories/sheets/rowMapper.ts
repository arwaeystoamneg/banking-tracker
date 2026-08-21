import "server-only";
import type { TabConfig } from "@/lib/repositories/sheets/tabs";

/** Reads header row + data rows for a tab and turns them into typed objects, matched by header name. */
export function sheetRowsToObjects(config: TabConfig, values: string[][]): Record<string, unknown>[] {
  if (values.length === 0) return [];
  const [headerRow, ...dataRows] = values;
  const headerIndex = new Map<string, number>();
  headerRow.forEach((h, i) => headerIndex.set(h.trim(), i));

  return dataRows
    .filter((row) => row.some((cell) => cell !== undefined && cell !== ""))
    .map((row) => {
      const obj: Record<string, unknown> = {};
      for (const header of config.headers) {
        const colIndex = headerIndex.get(header);
        const raw = colIndex === undefined ? "" : (row[colIndex] ?? "");
        obj[header] = coerceCell(header, raw, config);
      }
      return obj;
    });
}

function coerceCell(header: string, raw: string, config: TabConfig): unknown {
  if (config.booleanFields.includes(header)) {
    return raw.trim().toUpperCase() === "TRUE";
  }
  if (config.nullableNumberFields.includes(header)) {
    return raw === "" ? null : Number(raw);
  }
  if (config.numberFields.includes(header)) {
    return raw === "" ? 0 : Number(raw);
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
