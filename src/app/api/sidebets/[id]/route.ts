import { makeItemRoutes } from "@/lib/api/crudRoute";
import { sidebetPatchSchema, type Sidebet } from "@/lib/validation/schemas";
import type { SidebetCreate, SidebetPatch } from "@/lib/repositories/inferred";

export const { GET, PATCH, DELETE } = makeItemRoutes<Sidebet, SidebetCreate, SidebetPatch>("sidebets", sidebetPatchSchema);
