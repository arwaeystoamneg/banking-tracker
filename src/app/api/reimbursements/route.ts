import { makeListRoutes } from "@/lib/api/crudRoute";
import { reimbursementCreateSchema, type Reimbursement } from "@/lib/validation/schemas";
import type { ReimbursementCreate, ReimbursementPatch } from "@/lib/repositories/inferred";

export const { GET, POST } = makeListRoutes<Reimbursement, ReimbursementCreate, ReimbursementPatch>(
  "reimbursements",
  reimbursementCreateSchema,
);
