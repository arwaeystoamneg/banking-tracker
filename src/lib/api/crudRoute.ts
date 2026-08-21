import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { getRepositories } from "@/lib/repositories";
import type { CrudRepository, Repositories } from "@/lib/repositories/types";
import { apiError } from "@/lib/api/respond";

type RouteParams = { params: Promise<{ id: string }> };

/** Generic list route (GET all / POST create) shared by every tab's top-level /api/<tab> route. */
export function makeListRoutes<T, TCreate, TPatch>(repoKey: keyof Repositories, createSchema: z.ZodType<TCreate>) {
  return {
    GET: async () => {
      try {
        const repos = await getRepositories();
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
        const data = createSchema.parse(rest);
        const repos = await getRepositories();
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
 * Generic item route (GET one / PATCH / DELETE) shared by every tab's /api/<tab>/[id] route.
 * PATCH body shape: `{ patch: Partial<T>, expectedVersion: number }` — the offline write queue
 * (offline/queue.ts) always sends this shape so conflict detection is uniform across tabs.
 */
export function makeItemRoutes<T, TCreate, TPatch>(repoKey: keyof Repositories, patchSchema: z.ZodType<TPatch>) {
  return {
    GET: async (_request: NextRequest, { params }: RouteParams) => {
      try {
        const { id } = await params;
        const repos = await getRepositories();
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
        const parsedPatch = patchSchema.parse(body.patch);
        const expectedVersion = Number(body.expectedVersion);
        const repos = await getRepositories();
        const repo = repos[repoKey] as unknown as CrudRepository<T, TCreate, TPatch>;
        const updated = await repo.update(id, parsedPatch, expectedVersion);
        return NextResponse.json(updated);
      } catch (err) {
        return apiError(err);
      }
    },
    DELETE: async (_request: NextRequest, { params }: RouteParams) => {
      try {
        const { id } = await params;
        const repos = await getRepositories();
        const repo = repos[repoKey] as unknown as CrudRepository<T, TCreate, TPatch>;
        await repo.remove(id);
        return new NextResponse(null, { status: 204 });
      } catch (err) {
        return apiError(err);
      }
    },
  };
}
