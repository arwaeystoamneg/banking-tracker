import { makeListRoutes } from "@/lib/api/crudRoute";
import { loanEntryCreateSchema, type LoanEntry } from "@/lib/validation/schemas";
import type { LoanEntryCreate, LoanEntryPatch } from "@/lib/repositories/inferred";

export const { GET, POST } = makeListRoutes<LoanEntry, LoanEntryCreate, LoanEntryPatch>("loans", loanEntryCreateSchema);
