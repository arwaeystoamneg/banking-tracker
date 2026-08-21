import { z } from "zod";
import { ConflictError, NotFoundError, type CrudRepository } from "@/lib/repositories/types";
import { getMockStore, saveMockStore, type MockTables } from "@/lib/repositories/mock/store";
import { salvagePaytableRow, rowVersionMatches } from "@/lib/paytableRow";

interface RowVersioned {
  _row_version: number;
  [key: string]: unknown;
}

/**
 * One generic implementation backs every tab. `idField` is the tab's id column name (e.g. "game_id"),
 * `table` selects which array in the mock store this repository reads/writes.
 */
export function createMockRepository<T extends RowVersioned, TCreate, TPatch>(config: {
  tab: string;
  table: keyof MockTables;
  idField: string;
  makeId: () => string;
  rowSchema: z.ZodType<T>;
}): CrudRepository<T, TCreate, TPatch> {
  const { tab, table, idField, makeId, rowSchema } = config;

  function rows(): Record<string, unknown>[] {
    return getMockStore()[table];
  }

  return {
    async list() {
      const listed: T[] = [];
      for (const row of rows()) {
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
    },

    async get(id) {
      const row = rows().find((r) => r[idField] === id);
      return row ? rowSchema.parse(row) : null;
    },

    async create(data, id) {
      const rowId = id ?? makeId();
      const existing = rows().find((row) => row[idField] === rowId);
      if (existing) return rowSchema.parse(existing);
      const row = { [idField]: rowId, ...(data as object), _row_version: 1 } as unknown as Record<string, unknown>;
      const parsed = rowSchema.parse(row);
      rows().push(parsed as unknown as Record<string, unknown>);
      saveMockStore();
      return parsed;
    },

    async update(id, patch, expectedVersion) {
      const list = rows();
      const index = list.findIndex((r) => r[idField] === id);
      if (index === -1) throw new NotFoundError(tab, id);
      const existing = list[index];
      if ((existing._row_version as number) !== expectedVersion) {
        throw new ConflictError(tab, id, rowSchema.parse(existing));
      }
      const updated = {
        ...existing,
        ...(patch as object),
        [idField]: id,
        _row_version: (existing._row_version as number) + 1,
      };
      const parsed = rowSchema.parse(updated);
      list[index] = parsed as unknown as Record<string, unknown>;
      saveMockStore();
      return parsed;
    },

    async remove(id, expectedVersion) {
      const list = rows();
      const index = list.findIndex((r) => r[idField] === id);
      if (index === -1) return;
      const existing = list[index];
      if (!rowVersionMatches(existing._row_version, expectedVersion)) {
        throw new ConflictError(tab, id, rowSchema.safeParse(existing).success ? rowSchema.parse(existing) : existing);
      }
      list.splice(index, 1);
      saveMockStore();
    },
  };
}
