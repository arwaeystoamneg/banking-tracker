import { makeItemRoutes } from "@/lib/api/crudRoute";
import { roundPatchSchema, type Round } from "@/lib/validation/schemas";
import type { RoundCreate, RoundPatch } from "@/lib/repositories/inferred";

export const { GET, PATCH, DELETE } = makeItemRoutes<Round, RoundCreate, RoundPatch>("rounds", roundPatchSchema);
