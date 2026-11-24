import type { z } from "zod";
import { loanEntrySchema, payrollMemberSchema, reimbursementSchema, sessionSchema } from "@/lib/validation/schemas";
import type { CacheTab } from "@/offline/db";

/**
 * Rows this phone created are cached exactly as the form sent them, before the server fills in the rest. A field the
 * form leaves out (a new column, or one only Ray sets) is then missing locally until the next sync, and any screen that
 * reads it — `session.player_id.trim()` — crashed. Reading the cache fills every missing field with its schema default,
 * so a just-logged session looks like any other row everywhere in the app.
 */
const SCHEMAS: Partial<Record<CacheTab, { shape: Record<string, z.ZodType> }>> = {
  sessions: sessionSchema,
  reimbursements: reimbursementSchema,
  loans: loanEntrySchema,
  payrollMembers: payrollMemberSchema,
};

const cache = new Map<CacheTab, Record<string, unknown>>();

/** Each field's default (what the schema gives for a missing value); fields without one are left out. */
export function tabDefaults(tab: CacheTab): Record<string, unknown> | null {
  const schema = SCHEMAS[tab];
  if (!schema) return null;
  if (!cache.has(tab)) {
    const defaults: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(schema.shape)) {
      const parsed = field.safeParse(undefined);
      if (parsed.success && parsed.data !== undefined) defaults[key] = parsed.data;
    }
    cache.set(tab, defaults);
  }
  return cache.get(tab)!;
}

/** The row with every missing (undefined) field set to its default. Rows that already have a field keep it. */
export function withDefaults<T>(tab: CacheTab, row: T): T {
  const defaults = tabDefaults(tab);
  if (!defaults || !row || typeof row !== "object") return row;
  const record = row as Record<string, unknown>;
  let filled: Record<string, unknown> | null = null;
  for (const key of Object.keys(defaults)) {
    if (record[key] === undefined) {
      filled ??= { ...record };
      filled[key] = defaults[key];
    }
  }
  return (filled ?? row) as T;
}
