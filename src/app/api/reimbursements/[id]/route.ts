import { makeItemRoutes } from "@/lib/api/crudRoute";
import { reimbursementPatchSchema, type Reimbursement } from "@/lib/validation/schemas";
import type { ReimbursementCreate, ReimbursementPatch } from "@/lib/repositories/inferred";

export const { GET, PATCH, DELETE } = makeItemRoutes<Reimbursement, ReimbursementCreate, ReimbursementPatch>(
  "reimbursements",
  reimbursementPatchSchema,
);
