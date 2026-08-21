import { makeItemRoutes } from "@/lib/api/crudRoute";
import { paytablePatchSchema, type Paytable } from "@/lib/validation/schemas";
import type { PaytableCreate, PaytablePatch } from "@/lib/repositories/inferred";

export const { GET, PATCH, DELETE } = makeItemRoutes<Paytable, PaytableCreate, PaytablePatch>(
  "paytables",
  paytablePatchSchema,
);
