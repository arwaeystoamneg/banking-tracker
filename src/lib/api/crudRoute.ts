import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getRepositoriesForUser } from "@/lib/repositories";
import type { CrudRepository, Repositories } from "@/lib/repositories/types";
import { apiError } from "@/lib/api/respond";
import { InputError, requireCurrentUser } from "@/lib/auth/session";

/** Google Sheets caps a cell at 50,000 characters; a longer value would fail on write and retry forever. */
const MAX_CELL_CHARACTERS = 50_000;

export function assertFitsInCells(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, field] of Object.entries(value)) {
    if (typeof field === "string" && field.length > MAX_CELL_CHARACTERS) {
      throw new InputError(`${key} is too long (max ${MAX_CELL_CHARACTERS.toLocaleString()} characters)`);
    }
  }
}

type RouteParams = { params: Promise<{ id: string }> };

/** Generic list route (GET all / POST create) shared by every tab's top-level /api/<tab> route. */
export function makeListRoutes<T, TCreate, TPatch>(repoKey: keyof Repositories, createSchema: z.ZodType<TCreate>) {
  return {
    GET: async () => {
      try {
        const repos = await getRepositoriesForUser(await requireCurrentUser());
        const repo = repos[repoKey] as unknown as CrudRepository<T, TCreate, TPatch>;
        return NextResponse.json(await repo.list());
      } catch (err) {
        return apiError(err);
      }
    },
    POST: async (request: NextRequest) => {
      try {
        const body = await request.json();
        // `id`, when present, is a client-generated id from the offline write queue — using it
        // verbatim (rather than generating a new one server-side) means a session/round created
        // offline keeps the same id once it syncs, so the UI never has to swap URLs out from under
        // the user. See lib/ids.ts.
        const { id, ...rest } = body as Record<string, unknown> & { id?: unknown };
        assertFitsInCells(rest);
        const data = createSchema.parse(rest);
        const repos = await getRepositoriesForUser(await requireCurrentUser());
        const repo = repos[repoKey] as unknown as CrudRepository<T, TCreate, TPatch>;
        const created = await repo.create(data, typeof id === "string" ? id : undefined);
        return NextResponse.json(created, { status: 201 });
      } catch (err) {
        return apiError(err);
      }
    },
  };
}

/**
 * Patch schemas are `.partial()` views of row schemas whose fields carry `.default()`s, and zod still
 * applies a default to a key that is absent. Without this filter a one-field patch arrives with every
 * other defaulted field reset (casino "", buy_in 0, notes "", …) and the merge wipes the row.
 */
export function providedKeysOnly<T>(parsed: T, raw: unknown): T {
  if (!parsed || typeof parsed !== "object" || !raw || typeof raw !== "object") return parsed;
  const provided = new Set(Object.keys(raw));
  return Object.fromEntries(Object.entries(parsed).filter(([key]) => provided.has(key))) as T;
}

/**
 * Generic item route (GET one / PATCH / DELETE) shared by every tab's /api/<tab>/[id] route.
 * PATCH body shape: `{ patch: Partial<T>, expectedVersion: number }` — the offline write queue
 * (offline/queue.ts) always sends this shape so conflict detection is uniform across tabs.
 */
export function makeItemRoutes<T, TCreate, TPatch>(repoKey: keyof Repositories, patchSchema: z.ZodType<TPatch>) {
  return {
    GET: async (_request: NextRequest, { params }: RouteParams) => {
      try {
        const { id } = await params;
        const repos = await getRepositoriesForUser(await requireCurrentUser());
        const repo = repos[repoKey] as unknown as CrudRepository<T, TCreate, TPatch>;
        const row = await repo.get(id);
        if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
        return NextResponse.json(row);
      } catch (err) {
        return apiError(err);
      }
    },
    PATCH: async (request: NextRequest, { params }: RouteParams) => {
      try {
        const { id } = await params;
        const body = await request.json();
        assertFitsInCells(body?.patch);
        const parsedPatch = providedKeysOnly(patchSchema.parse(body.patch), body.patch);
        const expectedVersion = Number(body.expectedVersion);
        const repos = await getRepositoriesForUser(await requireCurrentUser());
        const repo = repos[repoKey] as unknown as CrudRepository<T, TCreate, TPatch>;
        const updated = await repo.update(id, parsedPatch, expectedVersion);
        return NextResponse.json(updated);
      } catch (err) {
        return apiError(err);
      }
    },
    DELETE: async (request: NextRequest, { params }: RouteParams) => {
      try {
        const { id } = await params;
        const body = await request.json();
        const expectedVersion = z.number().int().positive().parse(body.expectedVersion);
        const repos = await getRepositoriesForUser(await requireCurrentUser());
        const repo = repos[repoKey] as unknown as CrudRepository<T, TCreate, TPatch>;
        await repo.remove(id, expectedVersion);
        return new NextResponse(null, { status: 204 });
      } catch (err) {
        return apiError(err);
      }
    },
  };
}
