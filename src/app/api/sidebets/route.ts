import { makeListRoutes } from "@/lib/api/crudRoute";
import { sidebetCreateSchema, type Sidebet } from "@/lib/validation/schemas";
import type { SidebetCreate, SidebetPatch } from "@/lib/repositories/inferred";

export const { GET, POST } = makeListRoutes<Sidebet, SidebetCreate, SidebetPatch>("sidebets", sidebetCreateSchema);
