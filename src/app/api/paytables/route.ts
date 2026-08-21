import { makeListRoutes } from "@/lib/api/crudRoute";
import { paytableCreateSchema, type Paytable } from "@/lib/validation/schemas";
import type { PaytableCreate, PaytablePatch } from "@/lib/repositories/inferred";

export const { GET, POST } = makeListRoutes<Paytable, PaytableCreate, PaytablePatch>("paytables", paytableCreateSchema);
