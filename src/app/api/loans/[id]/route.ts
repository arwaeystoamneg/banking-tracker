import { makeItemRoutes } from "@/lib/api/crudRoute";
import { loanEntryPatchSchema, type LoanEntry } from "@/lib/validation/schemas";
import type { LoanEntryCreate, LoanEntryPatch } from "@/lib/repositories/inferred";

export const { GET, PATCH, DELETE } = makeItemRoutes<LoanEntry, LoanEntryCreate, LoanEntryPatch>("loans", loanEntryPatchSchema);
